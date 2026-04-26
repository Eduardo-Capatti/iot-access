module.exports = function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    res.status(200).json({
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
        SUPABASE_ADMIN_LIST_USERS_FN: process.env.SUPABASE_ADMIN_LIST_USERS_FN || 'admin-list-users',
        SUPABASE_ADMIN_CREATE_USER_FN: process.env.SUPABASE_ADMIN_CREATE_USER_FN || 'admin-create-user',
        SUPABASE_ADMIN_UPDATE_USER_FN: process.env.SUPABASE_ADMIN_UPDATE_USER_FN || 'admin-update-user',
        SUPABASE_ADMIN_DELETE_USER_FN: process.env.SUPABASE_ADMIN_DELETE_USER_FN || 'admin-delete-user',
    });
};
