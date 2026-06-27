#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <time.h>
#define idPorta 6
// ======================================================
// THINGSBOARD
// ======================================================

const char* mqtt_server = "demo.thingsboard.io";
const char* access_token = "TOKEN";

// ======================================================
// CLIENTES
// ======================================================

WiFiClient wifiClient;
PubSubClient client(wifiClient);

WiFiClientSecure secureClient;

// ======================================================
// PINOS
// ======================================================

const int relePin = 22;

const int barreiraEntradaPin = 19;
const int barreiraSaidaPin = 14;

const int sensorMagneticoPin = 16;

// ======================================================
// CONTROLE BARREIRAS
// ======================================================

unsigned long tempoBarreiraEntrada = 0;
unsigned long tempoBarreiraSaida = 0;

bool cicloEmAndamento = false;

unsigned long inicioBloqueio = 0;

bool portaBloqueada = false;

bool entradaDetectada = false;
bool saidaDetectada = false;

int totalPessoas = 0;
int qtdEntrada = 0;
int qtdSaida = 0;

int idAcesso = 0;

// ======================================================
// CONTROLE PORTA
// ======================================================

bool estadoPortaAnterior = LOW;


// ======================================================
// CONTROLE ABERTURA REMOTA
// ======================================================

unsigned long tempoRele = 0;

bool releAtivado = false;


// ==========================
// ESTRUTURA DO EVENTO
// ==========================

struct EventoFluxo {

  int tipoFluxo;

  time_t timestamp;
};

char horarioFormatado[30];

// ======================
// FILA
// ======================

#define MAX_FILA 100

EventoFluxo fila[MAX_FILA];

int inicioFila = 0;

int fimFila = 0;


// ======================================================
// SETUP
// ======================================================

void setup() {

  Serial.begin(9600);

  xTaskCreatePinnedToCore(
    taskSupabase,
    "taskSupabase",
    10000,
   NULL,
    1,
    NULL,
    0
  );

  configTime(
    -3 * 3600,
    0,
    "pool.ntp.org"
  );

  pinMode(relePin, OUTPUT);

  pinMode(barreiraEntradaPin, INPUT);
  pinMode(barreiraSaidaPin, INPUT);

  pinMode(sensorMagneticoPin, INPUT_PULLUP);

  digitalWrite(relePin, LOW);

  // HTTPS sem certificado
  secureClient.setInsecure();

  conectarWiFi();

  client.setServer(mqtt_server, 1883);

  connectMQTT();

  struct tm timeinfo;
  
  while (!getLocalTime(&timeinfo)) {
  
    Serial.println(
      "Aguardando horario..."
    );
  
    delay(1000);
  }

  Serial.println("Horario sincronizado");

  Serial.println("Sistema iniciado!");
    Serial.println(String(SECRET_supabaseKey));
  Serial.println(SECRET_supabaseUrl);

}

// ======================================================
// LOOP
// ======================================================

void loop() {

  if (!client.connected()) {
    connectMQTT();
  }

  client.loop();

  verificarPorta();


  if(digitalRead(sensorMagneticoPin) != 1){
    verificarAberturaRemota();

    controlarTempoRele();
  }else{
    verificarSensoresBarreira();

    verificarBloqueioSensores();
  }

  
  static unsigned long lastSend = 0;

  if (millis() - lastSend > 2000) {

    lastSend = millis();

    sendTelemetry();
  }
}


// Adicionar elemento na fila
void adicionarFila(int tipoFluxo) {

  // pega horário real
  time_t agora;

  time(&agora);

  fila[fimFila].tipoFluxo =
    tipoFluxo;

  fila[fimFila].timestamp =
    agora;

  fimFila++;

  // fila circular
  if (fimFila >= MAX_FILA) {

    fimFila = 0;
  }

  Serial.println("Evento adicionado na fila");
}

// ==========================
// PROCESSAR FILA
// ==========================

void processarFila() {

  // fila vazia
  if (inicioFila == fimFila) {
    return;
  }

  EventoFluxo evento =
    fila[inicioFila];

  bool sucesso =
    insertFluxoAcesso(
      evento.tipoFluxo,
      evento.timestamp
    );

  // remove da fila apenas se enviar
  if (sucesso) {

    inicioFila++;

    if (inicioFila >= MAX_FILA) {

      inicioFila = 0;
    }

    Serial.println("Evento enviado");
  }
}

// ==========================
// TASK DO SUPABASE
// ==========================

void taskSupabase(void * parameter) {

  while (true) {

    processarFila();

    // evita spam absurdo
    vTaskDelay(50 / portTICK_PERIOD_MS);
  }
}

// ======================================================
// WIFI
// ======================================================

void conectarWiFi() {

  WiFi.begin(SECRET_wifi_ssid, SECRET_wifi_password);

  Serial.print("Conectando WiFi");

  while (WiFi.status() != WL_CONNECTED) {

    delay(500);

    Serial.print(".");
  }

  Serial.println("\nWiFi conectado!");
}

// ======================================================
// MQTT
// ======================================================

void connectMQTT() {

  while (!client.connected()) {

    Serial.println("Conectando ThingsBoard...");

    if (client.connect("ESP32", access_token, NULL)) {

      Serial.println("MQTT conectado!");

    } else {

      Serial.print("Erro MQTT: ");

      Serial.println(client.state());

      delay(5000);
    }
  }
}

// ======================================================
// SENSORES BARREIRA
// ======================================================

void verificarSensoresBarreira() {

  bool entradaAtivada = digitalRead(barreiraEntradaPin) == LOW;
  bool saidaAtivada   = digitalRead(barreiraSaidaPin) == LOW;

  // ==================================================
  // AGUARDA LIBERAR OS DOIS SENSORES
  // ==================================================

  if (cicloEmAndamento) {

    // Só libera quando os dois estiverem livres
    if (!entradaAtivada && !saidaAtivada) {

      cicloEmAndamento = false;

      entradaDetectada = false;
      saidaDetectada = false;

      Serial.println("Sensores liberados");
    }

    // Enquanto estiver bloqueado, não faz nada
    return;
  }

  // ==================================================
  // SENSOR ENTRADA
  // ==================================================

  if (entradaAtivada && !entradaDetectada) {

    tempoBarreiraEntrada = millis();

    entradaDetectada = true;

    Serial.println("Sensor ENTRADA ativado");
  }

  // ==================================================
  // SENSOR SAIDA
  // ==================================================

  if (saidaAtivada && !saidaDetectada) {

    tempoBarreiraSaida = millis();

    saidaDetectada = true;

    Serial.println("Sensor SAIDA ativado");
  }

  // ==================================================
  // DEFINIR DIREÇÃO
  // ==================================================

  if (entradaDetectada && saidaDetectada) {

    Serial.println("================================");

    Serial.print("Tempo Entrada: ");
    Serial.println(tempoBarreiraEntrada);

    Serial.print("Tempo Saida: ");
    Serial.println(tempoBarreiraSaida);

    // ==========================================
    // ENTROU
    // ==========================================

    if (tempoBarreiraEntrada < tempoBarreiraSaida) {

      totalPessoas++;
      qtdEntrada++;

      Serial.println(">>> PESSOA ENTROU");

      Serial.print("TOTAL PESSOAS: ");
      Serial.println(totalPessoas);

      if(idAcesso != 0){
        adicionarFila(1);
      }
      
      enviarEvento("entrada");
    }

    // ==========================================
    // SAIU
    // ==========================================

    else {

      if (totalPessoas > 0) {
        totalPessoas--;
      }

      qtdSaida++;

      Serial.println("<<< PESSOA SAIU");

      Serial.print("TOTAL PESSOAS: ");
      Serial.println(totalPessoas);

      if(idAcesso != 0){
        adicionarFila(0);
      }
      enviarEvento("saida");

      
    }

    Serial.println("================================");

    // BLOQUEIA NOVAS CONTAGENS
    cicloEmAndamento = true;
  }
}

// ======================================================
// SENSORES BARREIRA Bloqueados
// ======================================================
  void verificarBloqueioSensores() {

  // se não estiver em ciclo, reseta
  if (!cicloEmAndamento) {

    inicioBloqueio = 0;

    // estava bloqueada e agora liberou
    if (portaBloqueada) {

      portaBloqueada = false;

      Serial.println("PORTA LIBERADA");

      atualizarPortaBloqueada(false);
    }

    return;
  }

  // começou o bloqueio agora
  if (inicioBloqueio == 0) {

    inicioBloqueio = millis();
  }

  // tempo bloqueado
  unsigned long tempoBloqueado =
    millis() - inicioBloqueio;

  // exemplo: 5 segundos
  if (tempoBloqueado >= 5000) {

    // evita spam no banco
    if (!portaBloqueada) {

      portaBloqueada = true;

      Serial.println("PORTA BLOQUEADA");

      atualizarPortaBloqueada(true);
    }
  }
}


// ======================================================
// SENSOR MAGNETICO
// ======================================================

void verificarPorta() {

  bool estadoAtual = digitalRead(sensorMagneticoPin);

  // ==========================================
  // MUDOU ESTADO
  // ==========================================

  if (estadoAtual != estadoPortaAnterior) {

    // LOW = FECHADA
    // HIGH = ABERTA

    int statusPorta = estadoAtual == LOW ? 1 : 0;

    Serial.println("================================");

    if (statusPorta == 1) {

      Serial.println("PORTA FECHADA");

      if((qtdEntrada != 0 || qtdSaida != 0) && idAcesso != 0){
        insertTotalAcesso();
        qtdEntrada = 0;
        qtdSaida = 0;
        totalPessoas = 0;
      }

      atualizarSaida();
      enviarEvento("porta_fechada");

    } else {

      Serial.println("PORTA ABERTA");
      enviarEvento("porta_aberta");
    }

    Serial.print("Status enviado Supabase: ");
    Serial.println(statusPorta);

    Serial.println("================================");

    atualizarStatusPortaSupabase(!statusPorta);

    estadoPortaAnterior = estadoAtual;

    delay(200);
  }
}

// ======================================================
// SUPABASE
// ======================================================

void atualizarStatusPortaSupabase(int statusPorta) {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi desconectado");

    return;
  }

  WiFiClientSecure client;

  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/Porta?idPorta=eq." + String(idPorta)
  ;

  http.begin(client, url);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", String(SECRET_supabaseKey));
  http.addHeader("Authorization", "Bearer " + String(SECRET_supabaseKey));
  http.addHeader("Prefer", "return=minimal");

  String body =
    "{\"statusPorta\": " + String(statusPorta) + "}";

  Serial.println("Enviando Supabase...");
  Serial.println(body);

  int responseCode = http.PATCH(body);

  Serial.print("HTTP Response: ");
  Serial.println(responseCode);

  if (responseCode == 204) {

    Serial.println("Atualizado com sucesso!");
  }
  else if (responseCode > 0) {

    String response = http.getString();

    Serial.println(response);
  }
  else {

    Serial.print("Erro: ");

    Serial.println(http.errorToString(responseCode));
  }

  http.end();
}


//Indicar bloqueio de porta
void atualizarPortaBloqueada(bool bloqueada) {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi desconectado");

    return;
  }

  WiFiClientSecure client;

  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/Porta?idPorta=eq." + String(idPorta);

  http.begin(client, url);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", String(SECRET_supabaseKey));
  http.addHeader("Authorization", "Bearer " + String(SECRET_supabaseKey));
  http.addHeader("Prefer", "return=minimal");

  String body =
    "{\"bloqueada\": " + String(bloqueada) + "}";

  Serial.println("Enviando Supabase...");
  Serial.println(body);

  int responseCode = http.PATCH(body);

  Serial.print("HTTP Response: ");
  Serial.println(responseCode);

  if (responseCode == 204) {

    Serial.println("Atualizado com sucesso!");
  }
  else if (responseCode > 0) {

    String response = http.getString();

    Serial.println(response);
  }
  else {

    Serial.print("Erro: ");

    Serial.println(http.errorToString(responseCode));
  }

  http.end();
}


//Adicionar horário de saída no Acesso
void atualizarSaida() {
  time_t tempoAtual;
  time(&tempoAtual);
  
  strftime(
    horarioFormatado,
    sizeof(horarioFormatado),
    "%Y-%m-%d %H:%M:%S",
    localtime(&tempoAtual)
  );

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi desconectado");

    return;
  }

  WiFiClientSecure client;

  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/Acesso?idAcesso=eq."+ String(idAcesso);

  http.begin(client, url);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", String(SECRET_supabaseKey));
  http.addHeader("Authorization", "Bearer " + String(SECRET_supabaseKey));
  http.addHeader("Prefer", "return=minimal");

  String body =
  "{\"saidaAcesso\": \"" +
    String(horarioFormatado) +
  "\"}";

  Serial.println("Enviando Supabase...");
  Serial.println(body);

  int responseCode = http.PATCH(body);

  Serial.print("HTTP Response: ");
  Serial.println(responseCode);

  if (responseCode == 204) {

    Serial.println("Atualizado com sucesso!");
  }
  else if (responseCode > 0) {

    String response = http.getString();

    Serial.println(response);
  }
  else {

    Serial.print("Erro: ");

    Serial.println(http.errorToString(responseCode));
  }

  http.end();
}


// ======================================================
// ABERTURA REMOTA SUPABASE
// ======================================================

void verificarAberturaRemota() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  WiFiClientSecure client;

  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/Porta?idPorta=eq." + String(idPorta) + "&select=abrirPorta";

  http.begin(client, url);

  http.addHeader("apikey", String(SECRET_supabaseKey));

  http.addHeader(
    "Authorization",
    "Bearer " + String(SECRET_supabaseKey)
  );

  int responseCode = http.GET();

  if (responseCode == 200) {

    String response = http.getString();

    Serial.println("Resposta Supabase:");
    Serial.println(response);

    // ==========================================
    // VERIFICA TRUE
    // ==========================================

    if (response.indexOf("\"abrirPorta\":true") > -1) {

      Serial.println("ABERTURA REMOTA DETECTADA");

      ativarRele();

      resetarAbrirPorta();
      
      idAcesso = encontrarIdAcesso(idPorta);
    }
  }

  else {

    Serial.print("Erro GET: ");

    Serial.println(responseCode);
  }

  http.end();
}


// ======================================================
// ATIVAR RELE
// ======================================================

void ativarRele() {

  digitalWrite(relePin, HIGH);

  releAtivado = true;

  tempoRele = millis();

  Serial.println("RELE ATIVADO");
}


// ======================================================
// DESLIGAR RELE AUTOMATICO
// ======================================================

void controlarTempoRele() {

  if (
    releAtivado &&
    millis() - tempoRele >= 3000
  ) {

    digitalWrite(relePin, LOW);

    releAtivado = false;

    Serial.println("RELE DESATIVADO");
  }
}

// ======================================================
// RESET ABRIR PORTA
// ======================================================

void resetarAbrirPorta() {

  WiFiClientSecure client;

  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/Porta?idPorta=eq." + String(idPorta)
  ;

  http.begin(client, url);

  http.addHeader("Content-Type", "application/json");

  http.addHeader("apikey", String(SECRET_supabaseKey));

  http.addHeader(
    "Authorization",
    "Bearer " + String(SECRET_supabaseKey)
  );

  http.addHeader("Prefer", "return=minimal");

  String body =
    "{\"abrirPorta\": false}";

  int responseCode = http.PATCH(body);

  Serial.print("Reset abrirPorta: ");

  Serial.println(responseCode);

  http.end();
}

//ENCONTRAR idAcesso
int encontrarIdAcesso(int id) {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi desconectado");

    return 0;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/Acesso" +
    "?idPorta=eq." + String(id) +
    "&order=idAcesso.desc" +
    "&limit=1";

  Serial.println("URL:");
  Serial.println(url);

  http.begin(client, url);

  http.addHeader("apikey", String(SECRET_supabaseKey));

  http.addHeader(
    "Authorization",
    "Bearer " + String(SECRET_supabaseKey)
  );

  http.addHeader(
    "Accept",
    "application/json"
  );

  int responseCode = http.GET();

  Serial.print("Response code: ");
  Serial.println(responseCode);

  if (responseCode == 200) {

    String response = http.getString();

    Serial.println("Resposta:");
    Serial.println(response);

    DynamicJsonDocument doc(1024);

    DeserializationError error =
      deserializeJson(doc, response);

    if (error) {

      Serial.print("Erro JSON: ");

      Serial.println(error.c_str());

      http.end();

      return 0;
    }

    // Verifica se retornou algum registro
    if (doc.size() > 0) {

      int idAcesso = doc[0]["idAcesso"];

      Serial.print("Último idAcesso: ");
      Serial.println(idAcesso);

      http.end();

      return idAcesso;
    }

    Serial.println("Nenhum acesso encontrado");
  }

  else {

    Serial.print("Erro GET: ");
    Serial.println(responseCode);

    String response = http.getString();

    Serial.println(response);
  }

  http.end();

  return 0;
}


//INSERIR FluxoAcesso
bool insertFluxoAcesso(
  int tipoAcesso,
  time_t timestamp
) {

  strftime(
    horarioFormatado,
    sizeof(horarioFormatado),
    "%Y-%m-%d %H:%M:%S",
    localtime(&timestamp)
  );

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi desconectado");

    return false;
  }

  WiFiClientSecure client;

  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/FluxoAcesso";

  http.begin(client, url);

  http.addHeader("Content-Type", "application/json");

  http.addHeader("apikey", String(SECRET_supabaseKey));

  http.addHeader(
    "Authorization",
    "Bearer " + String(SECRET_supabaseKey)
  );

  http.addHeader(
    "Prefer",
    "return=minimal"
  );

  String body =
  "{"
    "\"idAcesso\": " + String(idAcesso) + ","
    "\"statusFluxoAcesso\": " + String(tipoAcesso) + ","
    "\"horario\": \"" + String(horarioFormatado) + "\""
  "}";

  Serial.println("Enviando Supabase...");
  Serial.println(body);

  int responseCode = http.POST(body);

  Serial.print("HTTP Response: ");
  Serial.println(responseCode);

  // INSERT OK
  if (responseCode == 201) {

    Serial.println("Inserido com sucesso!");

    http.end();

    return true;
  }

  // erro HTTP
  if (responseCode > 0) {

    String response = http.getString();

    Serial.println(response);

    http.end();

    return false;
  }

  // erro conexão
  Serial.print("Erro: ");

  Serial.println(
    http.errorToString(responseCode)
  );

  http.end();

  return false;
}

void insertTotalAcesso() {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi desconectado");

    return;
  }

  WiFiClientSecure client;

  client.setInsecure();

  HTTPClient http;

  String url =
    String(SECRET_supabaseUrl) +
    "/rest/v1/TotalAcesso";

  http.begin(client, url);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", String(SECRET_supabaseKey));
  http.addHeader("Authorization", "Bearer " + String(SECRET_supabaseKey));
  http.addHeader("Prefer", "return=minimal");

  String body =
  "{"
    "\"idAcesso\": " + String(idAcesso) + ","
    "\"qtdEntrada\": " + String(qtdEntrada) + ","
    "\"qtdSaida\": " + String(qtdSaida) +
  "}";

  Serial.println("Enviando Supabase...");
  Serial.println(body);

  int responseCode = http.POST(body);

  Serial.print("HTTP Response: ");
  Serial.println(responseCode);

  if (responseCode == 204) {

    Serial.println("Atualizado com sucesso!");
  }
  else if (responseCode > 0) {

    String response = http.getString();

    Serial.println(response);
  }
  else {

    Serial.print("Erro: ");

    Serial.println(http.errorToString(responseCode));
  }

  http.end();
}


// ======================================================
// EVENTOS MQTT
// ======================================================

void enviarEvento(String evento) {

  String payload =
    "{\"evento\":\"" + evento +
    "\",\"timestamp\":" + String(millis()) +
    ",\"total_pessoas\":" + String(totalPessoas) +
    "}";

  Serial.println("MQTT -> " + payload);

  client.publish(
    "v1/devices/me/telemetry",
    payload.c_str()
  );
}

// ======================================================
// TELEMETRIA
// ======================================================

void sendTelemetry() {

  int releState = digitalRead(relePin);

  int sensorMagnetico =
    digitalRead(sensorMagneticoPin);

  String payload =
    "{"
    "\"idAcesso\":" + String(idAcesso) +
    "\"rele\":" + String(releState) +
    ",\"sensor_magnetico\":" + String(sensorMagnetico) +
    ",\"barreira_entrada\":" +
    String(digitalRead(barreiraEntradaPin) == LOW) +
    ",\"barreira_saida\":" +
    String(digitalRead(barreiraSaidaPin) == LOW) +
    ",\"total_pessoas\":" + String(totalPessoas) +
    "}";

  Serial.println("Telemetria:");
  Serial.println(payload);
    
  client.publish(
    "v1/devices/me/telemetry",
    payload.c_str()
  );
}
