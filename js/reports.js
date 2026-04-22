/* ============================================================
   REPORTS.JS - Relatorios, tabela e graficos
   ============================================================ */

let barChartInstance = null;
let lineChartInstance = null;

function renderReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;

    const doorOptions = AppData.doors.map(door =>
        `<option value="${door.id}">${door.name}</option>`
    ).join('');

    container.innerHTML = `
        <div class="reports-toolbar">
            <label>
                <i class="fas fa-door-open"></i>
                Filtrar por Porta:
                <select class="filter-select" id="report-door-filter" onchange="loadReportData()">
                    ${doorOptions}
                </select>
            </label>
        </div>

        <div class="reports-grid">
            <div class="report-card">
                <p class="report-card-title"><i class="fas fa-list-alt"></i> Historico de Acessos</p>
                <div class="report-table-wrapper">
                    <table class="data-table" id="report-table">
                        <thead>
                            <tr>
                                <th>Usuario</th>
                                <th>Status</th>
                                <th>Horario</th>
                            </tr>
                        </thead>
                        <tbody id="report-tbody"></tbody>
                    </table>
                </div>
            </div>

            <div class="charts-row">
                <div class="report-card">
                    <p class="report-card-title"><i class="fas fa-chart-bar"></i> Acessos Mensais</p>
                    <div class="chart-wrap">
                        <canvas id="chart-bar"></canvas>
                    </div>
                </div>
                <div class="report-card">
                    <p class="report-card-title"><i class="fas fa-chart-line"></i> Acessos por Horario (Hoje)</p>
                    <div class="chart-wrap">
                        <canvas id="chart-line"></canvas>
                    </div>
                </div>
            </div>
        </div>
    `;

    loadReportData();
}

function loadReportData() {
    const select = document.getElementById('report-door-filter');
    if (!select) return;

    const doorId = parseInt(select.value, 10);
    if (Number.isNaN(doorId)) return;

    renderAccessTable(doorId);
    renderBarChart(doorId);
    renderLineChart(doorId);
}

function renderAccessTable(doorId) {
    const tbody = document.getElementById('report-tbody');
    const logs = AppData.getAccessLogsByDoor(doorId);

    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-table">Nenhum acesso registrado</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => {
        const user = AppData.getUserById(log.userId);
        const userName = user ? user.name : log.userId;
        const statusColor = log.event === 'Entrou' ? 'var(--status-open)' : 'var(--status-closed)';
        const timeLabel = new Date(log.time).toLocaleString('pt-BR');

        return `
            <tr>
                <td>${userName}</td>
                <td><span style="color:${statusColor}; font-weight:600;">${log.event}</span></td>
                <td>${timeLabel}</td>
            </tr>
        `;
    }).join('');
}

function renderBarChart(doorId) {
    if (barChartInstance) barChartInstance.destroy();

    const ctx = document.getElementById('chart-bar').getContext('2d');
    const data = AppData.getMonthlyAccessData(doorId);
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    barChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [{
                label: 'Acessos',
                data,
                backgroundColor: 'rgba(0, 0, 200, 0.6)',
                borderColor: '#0000ff',
                borderWidth: 1,
                borderRadius: 5,
            }],
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            },
        },
    });
}

function renderLineChart(doorId) {
    if (lineChartInstance) lineChartInstance.destroy();

    const ctx = document.getElementById('chart-line').getContext('2d');
    const data = AppData.getHourlyAccessData(doorId);
    const labels = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}h`);

    lineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Acessos',
                data,
                borderColor: '#0000ff',
                backgroundColor: 'rgba(0,0,255,0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 3,
            }],
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
            },
            scales: {
                x: { ticks: { color: '#888', maxTicksLimit: 12 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            },
        },
    });
}
