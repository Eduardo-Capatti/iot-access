/* ============================================================
   REALTIME.JS - Assinaturas realtime do Supabase
   ============================================================ */

window.RealtimeService = {
    channels: {
        doors: null,
        reports: null,
        relations: null,
        users: null,
    },

    startAll() {
        if (!AppData?.supabase) return;

        this.startDoorSubscription();
        this.startReportsSubscription();
        this.startRelationsSubscription();
        this.startUsersSubscription();
    },

    stopAll() {
        Object.keys(this.channels).forEach(key => {
            const channel = this.channels[key];
            if (!channel || !AppData?.supabase) return;
            AppData.supabase.removeChannel(channel);
            this.channels[key] = null;
        });
    },

    isReportsActive() {
        return Boolean(document.getElementById('section-reports')?.classList.contains('active'));
    },

    isUsersActive() {
        return Boolean(document.getElementById('section-users')?.classList.contains('active'));
    },

    async refreshDoorsUI() {
        await AppData.loadDoors();
        renderDoors(getDoorSearchValue());
        syncOpenDoorModalStatus();
    },

    async refreshUsersUI() {
        await AppData.loadUsers();
        if (isAdminUser()) {
            renderUsers();
        }
    },

    async refreshRelationsUI() {
        await AppData.loadDoors();
        await AppData.loadUsers();

        renderDoors(getDoorSearchValue());
        if (isAdminUser()) {
            renderUsers();
        }

        syncOpenDoorModalStatus();

        if (typeof _editingUserId !== 'undefined' && _editingUserId) {
            refreshUserDoorsTable(_editingUserId);
        }
    },

    async refreshReportsUI() {
        await AppData.loadAccessLogs();
        if (this.isReportsActive()) {
            const reportFilter = document.getElementById('report-door-filter');
            if (reportFilter) {
                loadReportData();
            } else {
                renderReports();
            }
        }
    },

    startDoorSubscription() {
        if (this.channels.doors) return;

        this.channels.doors = AppData.supabase
            .channel('realtime-porta-updates')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'Porta',
                },
                payload => {
                    this.handleDoorUpdate(payload);
                }
            )
            .subscribe(status => {
                if (status === 'CHANNEL_ERROR') {
                    console.error('Falha ao conectar o realtime da tabela Porta.');
                }
            });
    },

    async handleDoorUpdate(payload) {
        const oldRecord = payload?.old || {};
        const newRecord = payload?.new || {};
        const watchedFields = ['statusPorta', 'abrirPorta', 'bloqueada'];
        const shouldRefresh = watchedFields.some(field => oldRecord[field] !== newRecord[field]);

        if (!shouldRefresh) return;

        try {
            await this.refreshDoorsUI();
            if (this.isReportsActive()) {
                const reportFilter = document.getElementById('report-door-filter');
                if (reportFilter) {
                    loadReportData();
                } else {
                    renderReports();
                }
            }
        } catch (error) {
            console.error('Falha ao aplicar atualizacao realtime das portas:', error);
        }
    },

    startReportsSubscription() {
        if (this.channels.reports) return;

        this.channels.reports = AppData.supabase
            .channel('realtime-reports-updates')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'Acesso' },
                payload => {
                    this.handleReportsChange('Acesso', payload);
                }
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'Acesso' },
                payload => {
                    this.handleReportsChange('Acesso', payload);
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'FluxoAcesso' },
                payload => {
                    this.handleReportsChange('FluxoAcesso', payload);
                }
            )
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'TotalAcesso' },
                payload => {
                    this.handleReportsChange('TotalAcesso', payload);
                }
            )
            .subscribe(status => {
                if (status === 'CHANNEL_ERROR') {
                    console.error('Falha ao conectar o realtime dos relatorios.');
                }
            });
    },

    async handleReportsChange(_table, _payload) {
        try {
            await this.refreshReportsUI();
        } catch (error) {
            console.error('Falha ao aplicar atualizacao realtime dos relatorios:', error);
        }
    },

    startRelationsSubscription() {
        if (this.channels.relations) return;

        this.channels.relations = AppData.supabase
            .channel('realtime-relations-updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'PortaUsuario' },
                payload => {
                    this.handleRelationsChange(payload);
                }
            )
            .subscribe(status => {
                if (status === 'CHANNEL_ERROR') {
                    console.error('Falha ao conectar o realtime de vinculos de porta.');
                }
            });
    },

    async handleRelationsChange(_payload) {
        try {
            await this.refreshRelationsUI();
        } catch (error) {
            console.error('Falha ao aplicar atualizacao realtime de vinculos:', error);
        }
    },

    startUsersSubscription() {
        if (this.channels.users) return;

        this.channels.users = AppData.supabase
            .channel('realtime-users-updates')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'log' },
                payload => {
                    this.handleUserLogInsert(payload);
                }
            )
            .subscribe(status => {
                if (status === 'CHANNEL_ERROR') {
                    console.error('Falha ao conectar o realtime de usuarios.');
                }
            });
    },

    async handleUserLogInsert(payload) {
        const logRow = payload?.new || {};
        if (logRow.tabela !== 'Usuario') return;

        try {
            await this.refreshUsersUI();
        } catch (error) {
            console.error('Falha ao aplicar atualizacao realtime de usuarios:', error);
        }
    },
};
