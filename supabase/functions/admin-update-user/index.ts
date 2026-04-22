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
    const id = String(body.id || "").trim();

    if (!id) {
      return errorResponse("Informe o id do usuario.", 400);
    }

    const { data: existingData, error: existingError } = await supabase.auth.admin.getUserById(id);
    if (existingError || !existingData.user) {
      return errorResponse("Usuario nao encontrado.", 404, existingError?.message);
    }

    const existingUser = existingData.user;
    const currentAppMetadata = existingUser.app_metadata ?? {};
    const currentUserMetadata = existingUser.user_metadata ?? {};

    const name = String(body.name || currentUserMetadata.name || currentUserMetadata.nome || "").trim();
    const email = String(body.email || existingUser.email || "").trim().toLowerCase();
    const { data: roleData, error: roleLoadError } = await supabase
      .from("user_roles")
      .select("admin")
      .eq("id", id)
      .maybeSingle();

    if (roleLoadError) {
      return errorResponse("Nao foi possivel consultar o papel do usuario.", 500, roleLoadError.message);
    }

    const type = Number(body.type ?? (roleData?.admin ? 1 : 0)) === 1 ? 1 : 0;
    const status = Number(body.status || currentAppMetadata.status || currentUserMetadata.status || 0) === 1 ||
        body.status === "blocked"
      ? 1
      : 0;

    const updatePayload: Record<string, unknown> = {
      email,
      app_metadata: {
        ...currentAppMetadata,
        status,
      },
      user_metadata: {
        ...currentUserMetadata,
        name,
        nome: name,
        status,
      },
    };

    if (body.password) {
      updatePayload.password = String(body.password);
    }

    const { data, error: updateError } = await supabase.auth.admin.updateUserById(id, updatePayload);
    if (updateError || !data.user) {
      return errorResponse("Nao foi possivel atualizar o usuario.", 500, updateError?.message);
    }

    const { error: roleSaveError } = await supabase
      .from("user_roles")
      .upsert({
        id,
        admin: type === 1,
      });

    if (roleSaveError) {
      return errorResponse("Usuario atualizado, mas nao foi possivel salvar user_roles.", 500, roleSaveError.message);
    }

    return json({
      user: normalizeManagedUser(data.user, type === 1),
    });
  } catch (caughtError) {
    return errorResponse("Falha inesperada ao atualizar usuario.", 500, caughtError);
  }
});
