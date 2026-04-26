/* ============================================================
   DATA.JS - Estado global e integracao com Supabase
   ============================================================ */

const DEFAULT_ADMIN_FUNCTIONS = {
    listUsers: 'admin-list-users',
    createUser: 'admin-create-user',
    updateUser: 'admin-update-user',
    deleteUser: 'admin-delete-user',
};

const AppConfig = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    adminFunctions: { ...DEFAULT_ADMIN_FUNCTIONS },
    loaded: false,
    loadPromise: null,

    async load() {
        if (this.loaded) return this;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            const response = await fetch('/api/env', {
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Nao foi possivel carregar a configuracao da aplicacao.');
            }

            const config = await response.json();

            this.supabaseUrl = config?.SUPABASE_URL || '';
            this.supabaseAnonKey = config?.SUPABASE_ANON_KEY || '';
            this.adminFunctions = {
                listUsers: config?.SUPABASE_ADMIN_LIST_USERS_FN || DEFAULT_ADMIN_FUNCTIONS.listUsers,
                createUser: config?.SUPABASE_ADMIN_CREATE_USER_FN || DEFAULT_ADMIN_FUNCTIONS.createUser,
                updateUser: config?.SUPABASE_ADMIN_UPDATE_USER_FN || DEFAULT_ADMIN_FUNCTIONS.updateUser,
                deleteUser: config?.SUPABASE_ADMIN_DELETE_USER_FN || DEFAULT_ADMIN_FUNCTIONS.deleteUser,
            };

            if (!this.supabaseUrl || !this.supabaseAnonKey) {
                throw new Error('Nao foi possivel iniciar a conexao com o sistema.');
            }

            this.loaded = true;
            return this;
        })().catch(error => {
            this.loaded = false;
            throw error;
        }).finally(() => {
            if (!this.loaded) {
                this.loadPromise = null;
            }
        });

        return this.loadPromise;
    },
};

const ACTION_CODES = {
    insert: 1,
    update: 2,
    delete: 3,
};

// Premissas deste frontend:
// - Perfil admin vem da tabela user_roles, onde admin=true.
// - Em PortaUsuarioStatus, statusPortaUsuario=1 significa acesso bloqueado.

function ensureSupabaseConfig() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Biblioteca do Supabase nao foi carregada.');
    }
}

function normalizeDoorStatus(value) {
    return Number(value) === 1 ? 'open' : 'closed';
}

function denormalizeDoorStatus(value) {
    return value === 'open' ? 1 : 0;
}

function isDoorOpen(value) {
    return value === 'open';
}

function normalizeUserStatus(value) {
    return Number(value) === 1 ? 'blocked' : 'active';
}

function resolveUserName(user) {
    const metadata = {
        ...(user?.app_metadata || {}),
        ...(user?.user_metadata || {}),
    };

    return metadata.name || metadata.nome || metadata.full_name || user.email || 'Usuario';
}

function getStatusRow(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0];
}

async function getFunctionErrorMessage(error, functionName) {
    const fallbackMessage = error?.message ||
        `Falha ao chamar a Edge Function "${functionName}".`;

    const response = error?.context;
    if (!response || typeof response.clone !== 'function') {
        return fallbackMessage;
    }

    try {
        const payload = await response.clone().json();
        if (payload?.error) {
            return payload.details
                ? `${payload.error} (${payload.details})`
                : payload.error;
        }
    } catch (_) {
        // Ignora falhas de parse de JSON e tenta ler como texto.
    }

    try {
        const text = (await response.clone().text()).trim();
        if (text) return text;
    } catch (_) {
        // Mantem a mensagem de fallback quando o corpo nao puder ser lido.
    }

    return fallbackMessage;
}

const AppData = {
    supabase: null,
    currentUser: null,
    doors: [],
    users: [],
    accessLogs: [],
    doorRelations: [],

    async setupClient() {
        if (this.supabase) return this.supabase;

        await AppConfig.load();
        ensureSupabaseConfig();
        this.supabase = window.supabase.createClient(AppConfig.supabaseUrl, AppConfig.supabaseAnonKey);
        return this.supabase;
    },

    resetState() {
        this.currentUser = null;
        this.doors = [];
        this.users = [];
        this.accessLogs = [];
        this.doorRelations = [];
    },

    async initialize() {
        await this.setupClient();

        await this.loadCurrentUser();
        await this.refreshAll();
    },

    async loadCurrentUser() {
        const { data, error } = await this.supabase.auth.getUser();
        if (error) throw error;
        if (!data?.user) {
            throw new Error('Nenhum usuario autenticado foi encontrado no Supabase.');
        }

        const user = data.user;
        const isAdmin = await this.getIsAdminByUserId(user.id);
        this.currentUser = {
            id: user.id,
            name: resolveUserName(user),
            email: user.email || '',
            type: isAdmin ? 1 : 0,
            status: 'active',
            doorIds: [],
        };
    },

    async getIsAdminByUserId(userId) {
        const { data, error } = await this.supabase
            .from('user_roles')
            .select('admin')
            .eq('id', userId)
            .maybeSingle();

        if (error) throw error;
        return Boolean(data?.admin);
    },

    async refreshAll() {
        await Promise.all([
            this.loadDoors(),
            this.loadUsers(),
            this.loadAccessLogs(),
        ]);
    },

    async loadDoors() {
        const { data, error } = await this.supabase
            .from('Porta')
            .select('"idPorta","nomePorta","statusPorta"')
            .order('idPorta', { ascending: true });

        if (error) throw error;

        this.doors = (data || []).map(door => ({
            id: door.idPorta,
            name: door.nomePorta,
            status: normalizeDoorStatus(door.statusPorta),
            hardware: 'Supabase',
        }));

        await this.loadDoorRelations();
    },

    async loadDoorRelations() {
        let query = this.supabase
            .from('PortaUsuario')
            .select(`
                "idPortaUsuario",
                "idPorta",
                "idUsuario",
                PortaUsuarioStatus (
                    "statusPortaUsuario",
                    "idUsuario"
                )
            `)
            .order('idPortaUsuario', { ascending: true });

        if (this.currentUser.type !== 1) {
            query = query.eq('idUsuario', this.currentUser.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        this.doorRelations = (data || []).map(row => {
            const statusRow = getStatusRow(row.PortaUsuarioStatus);
            const blocked = Number(statusRow?.statusPortaUsuario || 0) === 1;

            return {
                id: row.idPortaUsuario,
                doorId: row.idPorta,
                userId: row.idUsuario,
                blocked,
                blockedByUserId: statusRow?.idUsuario || null,
            };
        });

        this.applyDoorRelationsToUsers();
    },

    async loadUsers() {
        if (this.currentUser.type !== 1) {
            this.users = [{ ...this.currentUser }];
            this.applyDoorRelationsToUsers();
            return;
        }

        let users = [];

        try {
            const payload = await this.invokeAdminFunction(AppConfig.adminFunctions.listUsers);
            users = Array.isArray(payload?.users) ? payload.users : [];
        } catch (error) {
            console.warn('Edge Function de usuarios indisponivel:', error.message || error);
        }

        this.users = users.map(user => ({
            id: user.id,
            name: user.name || user.nome || user.full_name || user.email || 'Usuario',
            email: user.email || '',
            type: Number(user.type || user.tipo || 0) === 1 ? 1 : 0,
            status: normalizeUserStatus(user.status ?? user.statusUsuario ?? 0),
            doorIds: [],
        }));

        if (!this.users.find(user => user.id === this.currentUser.id)) {
            this.users.unshift({ ...this.currentUser, doorIds: [] });
        }

        this.applyDoorRelationsToUsers();
    },

    async loadAccessLogs() {
        let query = this.supabase
            .from('Acesso')
            .select('"idAcesso","horarioAcesso","statusAcesso","idUsuario","idPorta"')
            .order('horarioAcesso', { ascending: false });

        if (this.currentUser.type !== 1) {
            query = query.eq('idUsuario', this.currentUser.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        this.accessLogs = (data || []).map(log => ({
            id: log.idAcesso,
            userId: log.idUsuario,
            doorId: log.idPorta,
            event: Number(log.statusAcesso) === 1 ? 'Entrou' : 'Falhou',
            statusCode: log.statusAcesso,
            time: log.horarioAcesso,
        }));
    },

    applyDoorRelationsToUsers() {
        const usersById = new Map(
            (this.users || []).map(user => [user.id, { ...user, doorIds: [] }])
        );

        if (this.currentUser && !usersById.has(this.currentUser.id)) {
            usersById.set(this.currentUser.id, { ...this.currentUser, doorIds: [] });
        }

        this.doorRelations.forEach(relation => {
            const user = usersById.get(relation.userId);
            if (!user || relation.blocked) return;
            user.doorIds.push(relation.doorId);
        });

        this.users = Array.from(usersById.values());

        const currentUser = usersById.get(this.currentUser?.id);
        if (currentUser) {
            this.currentUser = { ...this.currentUser, doorIds: [...currentUser.doorIds] };
        }
    },

    async invokeAdminFunction(functionName, body = {}) {
        const { data, error } = await this.supabase.functions.invoke(functionName, { body });
        if (error) {
            const message = await getFunctionErrorMessage(error, functionName);
            throw new Error(message);
        }
        return data;
    },

    async createDoor(payload) {
        const { data, error } = await this.supabase
            .from('Porta')
            .insert({
                nomePorta: payload.name,
                statusPorta: denormalizeDoorStatus(payload.status),
            })
            .select('"idPorta","nomePorta","statusPorta"')
            .single();

        if (error) throw error;

        await this.logAction(ACTION_CODES.insert, 'Porta');

        return {
            id: data.idPorta,
            name: data.nomePorta,
            status: normalizeDoorStatus(data.statusPorta),
            hardware: 'Supabase',
        };
    },

    async updateDoor(id, payload) {
        const { error } = await this.supabase
            .from('Porta')
            .update({
                nomePorta: payload.name,
                statusPorta: denormalizeDoorStatus(payload.status),
            })
            .eq('idPorta', id);

        if (error) throw error;

        await this.logAction(ACTION_CODES.update, 'Porta');
    },

    async deleteDoor(id) {
        const relationIds = this.doorRelations
            .filter(relation => relation.doorId === id)
            .map(relation => relation.id);

        if (relationIds.length > 0) {
            const { error: statusError } = await this.supabase
                .from('PortaUsuarioStatus')
                .delete()
                .in('idPortaUsuario', relationIds);

            if (statusError) throw statusError;

            const { error: relationError } = await this.supabase
                .from('PortaUsuario')
                .delete()
                .eq('idPorta', id);

            if (relationError) throw relationError;
        }

        const { error } = await this.supabase
            .from('Porta')
            .delete()
            .eq('idPorta', id);

        if (error) throw error;

        await this.logAction(ACTION_CODES.delete, 'Porta');
    },

    async registerAccess(doorId) {
        const door = this.getDoorById(doorId);
        if (!door) {
            throw new Error('Porta nao encontrada.');
        }

        if (isDoorOpen(door.status)) {
            throw new Error(`A porta "${door.name}" ja esta aberta.`);
        }

        const { error } = await this.supabase
            .from('Acesso')
            .insert({
                idUsuario: this.currentUser.id,
                idPorta: doorId,
                statusAcesso: 1,
            });

        if (error) throw error;

        await this.updateDoor(doorId, {
            name: door.name,
            status: 'open',
        });

        door.status = 'open';
    },

    async createUser(payload) {
        const data = await this.invokeAdminFunction(AppConfig.adminFunctions.createUser, payload);
        await this.logAction(ACTION_CODES.insert, 'Usuario');
        return data;
    },

    async updateUser(id, payload) {
        await this.invokeAdminFunction(AppConfig.adminFunctions.updateUser, {
            id,
            ...payload,
        });
        await this.logAction(ACTION_CODES.update, 'Usuario');
    },

    async deleteUser(id) {
        await this.invokeAdminFunction(AppConfig.adminFunctions.deleteUser, { id });
        await this.logAction(ACTION_CODES.delete, 'Usuario');
    },

    async linkDoorToUser(userId, doorId) {
        const existing = this.findDoorRelation(userId, doorId);

        if (existing) {
            if (existing.blocked) {
                await this.unblockDoorForUserByRelation(existing.id);
            }
            return existing;
        }

        const { data, error } = await this.supabase
            .from('PortaUsuario')
            .insert({
                idUsuario: userId,
                idPorta: doorId,
            })
            .select('"idPortaUsuario","idPorta","idUsuario"')
            .single();

        if (error) throw error;

        await this.logAction(ACTION_CODES.insert, 'PortaUsuario');

        return data;
    },

    async removeDoorFromUser(userId, doorId) {
        const relation = this.findDoorRelation(userId, doorId);
        if (!relation) return;

        const { error: statusError } = await this.supabase
            .from('PortaUsuarioStatus')
            .delete()
            .eq('idPortaUsuario', relation.id);

        if (statusError) throw statusError;

        const { error } = await this.supabase
            .from('PortaUsuario')
            .delete()
            .eq('idPortaUsuario', relation.id);

        if (error) throw error;

        await this.logAction(ACTION_CODES.delete, 'PortaUsuario');
    },

    async blockDoorForUser(userId, doorId) {
        const relation = this.findDoorRelation(userId, doorId);
        if (!relation) {
            throw new Error('Vinculo de porta nao encontrado para este usuario.');
        }

        const { error: deleteError } = await this.supabase
            .from('PortaUsuarioStatus')
            .delete()
            .eq('idPortaUsuario', relation.id);

        if (deleteError) throw deleteError;

        const { error } = await this.supabase
            .from('PortaUsuarioStatus')
            .insert({
                idPortaUsuario: relation.id,
                statusPortaUsuario: 1,
                idUsuario: this.currentUser.id,
            });

        if (error) throw error;

        await this.logAction(ACTION_CODES.update, 'PortaUsuarioStatus');
    },

    async unblockDoorForUserByRelation(relationId) {
        const { error } = await this.supabase
            .from('PortaUsuarioStatus')
            .delete()
            .eq('idPortaUsuario', relationId);

        if (error) throw error;

        await this.logAction(ACTION_CODES.update, 'PortaUsuarioStatus');
    },

    async toggleDoorBlock(userId, doorId) {
        const relation = this.findDoorRelation(userId, doorId);
        if (!relation) {
            throw new Error('Vinculo de porta nao encontrado para este usuario.');
        }

        if (relation.blocked) {
            await this.unblockDoorForUserByRelation(relation.id);
        } else {
            await this.blockDoorForUser(userId, doorId);
        }
    },

    async logAction(action, table) {
        if (!this.currentUser?.id) return;

        const { error } = await this.supabase
            .from('log')
            .insert({
                idUsuario: this.currentUser.id,
                acao: action,
                tabela: table,
            });

        if (error) {
            console.error('Nao foi possivel registrar log:', error.message || error);
        }
    },

    getDoorById(id) {
        return this.doors.find(door => door.id === id);
    },

    getUserById(id) {
        return this.users.find(user => user.id === id);
    },

    findDoorRelation(userId, doorId) {
        return this.doorRelations.find(
            relation => relation.userId === userId && relation.doorId === doorId
        );
    },

    getDoorsForUser(userId, options = {}) {
        const includeBlocked = Boolean(options.includeBlocked);

        return this.doorRelations
            .filter(relation => relation.userId === userId && (includeBlocked || !relation.blocked))
            .map(relation => {
                const door = this.getDoorById(relation.doorId);
                if (!door) return null;
                return {
                    ...door,
                    relationId: relation.id,
                    blocked: relation.blocked,
                    blockedByUserId: relation.blockedByUserId,
                };
            })
            .filter(Boolean);
    },

    getUsersForDoor(doorId, options = {}) {
        const includeBlocked = Boolean(options.includeBlocked);

        return this.doorRelations
            .filter(relation => relation.doorId === doorId && (includeBlocked || !relation.blocked))
            .map(relation => {
                const user = this.getUserById(relation.userId);
                if (!user) {
                    return {
                        id: relation.userId,
                        name: relation.userId,
                        email: '',
                        blocked: relation.blocked,
                    };
                }

                return {
                    ...user,
                    blocked: relation.blocked,
                };
            });
    },

    getAccessLogsByDoor(doorId) {
        return this.accessLogs.filter(log => log.doorId === doorId);
    },

    getMonthlyAccessData(doorId) {
        const values = Array(12).fill(0);
        const currentYear = new Date().getFullYear();

        this.getAccessLogsByDoor(doorId).forEach(log => {
            const date = new Date(log.time);
            if (Number.isNaN(date.getTime()) || date.getFullYear() !== currentYear) return;
            values[date.getMonth()] += 1;
        });

        return values;
    },

    getHourlyAccessData(doorId) {
        const values = Array(24).fill(0);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const currentDay = now.getDate();

        this.getAccessLogsByDoor(doorId).forEach(log => {
            const date = new Date(log.time);
            if (Number.isNaN(date.getTime())) return;
            if (
                date.getFullYear() !== currentYear ||
                date.getMonth() !== currentMonth ||
                date.getDate() !== currentDay
            ) {
                return;
            }
            values[date.getHours()] += 1;
        });

        return values;
    },
};
