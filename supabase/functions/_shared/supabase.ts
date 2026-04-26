import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(message: string, status = 400, details?: unknown) {
  return json({
    error: message,
    details: details ?? null,
  }, status);
}

export function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Nao foi possivel iniciar a camada administrativa do sistema.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createRequestClient(request: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey) {
    throw new Error("Nao foi possivel iniciar a conexao autenticada com o sistema.");
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireAdminUser(request: Request) {
  const supabase = createAdminClient();
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return {
      supabase,
      error: errorResponse("Token de autenticacao ausente.", 401),
      user: null,
    };
  }

  const requestClient = createRequestClient(request);
  const { data, error } = await requestClient.auth.getUser();

  if (error || !data?.user) {
    return {
      supabase,
      error: errorResponse("Sessao invalida ou expirada.", 401, error?.message),
      user: null,
    };
  }

  const isAdmin = await getIsAdminByUserId(supabase, data.user.id);
  if (!isAdmin) {
    return {
      supabase,
      error: errorResponse("Acesso negado. Apenas administradores podem usar esta function.", 403),
      user: null,
    };
  }

  return {
    supabase,
    error: null,
    user: data.user,
  };
}

export async function getIsAdminByUserId(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("admin")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Nao foi possivel consultar user_roles para o usuario ${userId}: ${error.message}`);
  }

  return Boolean(data?.admin);
}

export async function getUserRolesMap(supabase: SupabaseClient, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, boolean>();

  const { data, error } = await supabase
    .from("user_roles")
    .select("id, admin")
    .in("id", userIds);

  if (error) {
    throw new Error(`Nao foi possivel consultar user_roles: ${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.id as string, Boolean(row.admin)]));
}

export function normalizeManagedUser(user: User, isAdmin = false) {
  const metadata = {
    ...(user.app_metadata ?? {}),
    ...(user.user_metadata ?? {}),
  };

  const status = metadata.status === 1 || metadata.status === "1" || metadata.status === "blocked"
    ? 1
    : 0;
  const type = isAdmin ? 1 : 0;

  return {
    id: user.id,
    email: user.email ?? "",
    name: metadata.name || metadata.nome || metadata.full_name || user.email || "Usuario",
    type,
    status,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at,
  };
}
