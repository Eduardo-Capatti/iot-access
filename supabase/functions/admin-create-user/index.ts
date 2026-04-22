import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  errorResponse,
  json,
  normalizeManagedUser,
  requireAdminUser,
} from "../_shared/supabase.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Metodo nao permitido.", 405);
  }

  const { supabase, error } = await requireAdminUser(request);
  if (error) return error;

  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim();
    const type = Number(body.type || 0) === 1 ? 1 : 0;
    const status = Number(body.status || 0) === 1 || body.status === "blocked" ? 1 : 0;

    if (!email || !password || !name) {
      return errorResponse("Campos obrigatorios: name, email e password.", 400);
    }

    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        status,
      },
      user_metadata: {
        name,
        nome: name,
        status,
      },
    });

    if (createError || !data.user) {
      return errorResponse("Nao foi possivel criar o usuario.", 500, createError?.message);
    }

    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({
        id: data.user.id,
        admin: type === 1,
      });

    if (roleError) {
      return errorResponse("Usuario criado, mas nao foi possivel salvar user_roles.", 500, roleError.message);
    }

    return json({
      user: normalizeManagedUser(data.user, type === 1),
    }, 201);
  } catch (caughtError) {
    return errorResponse("Falha inesperada ao criar usuario.", 500, caughtError);
  }
});
