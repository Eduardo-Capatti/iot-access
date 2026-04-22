import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  corsHeaders,
  errorResponse,
  getUserRolesMap,
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
    const users = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const { data, error: listError } = await supabase.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        return errorResponse("Nao foi possivel listar usuarios.", 500, listError.message);
      }

      const batch = data.users ?? [];
      const rolesMap = await getUserRolesMap(
        supabase,
        batch.map((user) => user.id),
      );
      users.push(...batch.map((user) => normalizeManagedUser(user, rolesMap.get(user.id) === true)));

      if (batch.length < perPage) break;
      page += 1;
    }

    return json({ users });
  } catch (caughtError) {
    return errorResponse("Falha inesperada ao listar usuarios.", 500, caughtError);
  }
});
