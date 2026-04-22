import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  errorResponse,
  json,
  requireAdminUser,
} from "../_shared/supabase.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Metodo nao permitido.", 405);
  }

  const { supabase, error, user: adminUser } = await requireAdminUser(request);
  if (error) return error;

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();

    if (!id) {
      return errorResponse("Informe o id do usuario.", 400);
    }

    if (id === adminUser?.id) {
      return errorResponse("Voce nao pode excluir o proprio usuario.", 400);
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("admin")
      .eq("id", id)
      .maybeSingle();

    if (roleError) {
      return errorResponse("Nao foi possivel consultar o papel do usuario.", 500, roleError.message);
    }

    if (roleData?.admin === true) {
      return errorResponse("Nao e permitido excluir outros administradores.", 403);
    }

    const { data: relationsData, error: relationsError } = await supabase
      .from("PortaUsuario")
      .select('"idPortaUsuario"')
      .eq("idUsuario", id);

    if (relationsError) {
      return errorResponse("Nao foi possivel buscar os vinculos do usuario.", 500, relationsError.message);
    }

    const relationIds = (relationsData ?? []).map((row) => row.idPortaUsuario);

    if (relationIds.length > 0) {
      const { error: relationStatusError } = await supabase
        .from("PortaUsuarioStatus")
        .delete()
        .in("idPortaUsuario", relationIds);

      if (relationStatusError) {
        return errorResponse("Nao foi possivel remover os bloqueios vinculados ao usuario.", 500, relationStatusError.message);
      }
    }

    const { error: blockerStatusError } = await supabase
      .from("PortaUsuarioStatus")
      .delete()
      .eq("idUsuario", id);

    if (blockerStatusError) {
      return errorResponse("Nao foi possivel remover os registros de bloqueio do usuario.", 500, blockerStatusError.message);
    }

    const { error: relationDeleteError } = await supabase
      .from("PortaUsuario")
      .delete()
      .eq("idUsuario", id);

    if (relationDeleteError) {
      return errorResponse("Nao foi possivel remover os vinculos do usuario.", 500, relationDeleteError.message);
    }

    const { error: logDeleteError } = await supabase
      .from("log")
      .delete()
      .eq("idUsuario", id);

    if (logDeleteError) {
      return errorResponse("Nao foi possivel remover os logs do usuario.", 500, logDeleteError.message);
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(id);
    if (deleteError) {
      return errorResponse("Nao foi possivel excluir o usuario.", 500, deleteError.message);
    }

    return json({ success: true });
  } catch (caughtError) {
    return errorResponse("Falha inesperada ao excluir usuario.", 500, caughtError);
  }
});
