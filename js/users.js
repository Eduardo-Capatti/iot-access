/* ============================================================
   USERS.JS - Gerenciamento de Usuarios
   ============================================================ */

let _editingUserId = null;

function renderUsers(filter = '') {
    const grid = document.getElementById('users-grid');
    if (!grid) return;

    let users = AppData.users;

    if (filter) {
        const query = filter.toLowerCase();
        users = users.filter(user =>
            user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
        );
    }

    if (users.length === 0) {
        grid.innerHTML = '<p style="color:#555; grid-column:1/-1; text-align:center; padding:40px;">Nenhum usuario encontrado.</p>';
        return;
    }

    grid.innerHTML = users.map(buildUserCard).join('');
}

function buildUserCard(user) {
    const typeLabel = user.type === 1 ? 'Administrador' : 'Usuario Normal';
    const typeBadge = user.type === 1 ? 'badge-admin' : 'badge-user';
    const statusLabel = user.status === 'active' ? 'Ativo' : 'Bloqueado';
    const statusDot = user.status === 'active' ? 'dot-open' : 'dot-blocked';
    const doorsCount = user.doorIds.length;
    const canDelete = canDeleteUser(user);
    const deleteButton = canDelete ? `
                <button class="btn-card-action btn-card-delete" title="Excluir usuario" onclick="deleteUser('${user.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
    ` : '';

    return `
        <div class="card" id="user-card-${user.id}">
            <div class="card-header">
                <span>${user.name}</span>
                <span class="badge ${typeBadge}">${typeLabel}</span>
            </div>
            <div class="card-body">
                <div class="card-row">
                    <span class="card-label">E-mail</span>
                    <span style="font-size:13px;">${user.email || '-'}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">Status</span>
                    <span>${statusLabel} <span class="status-dot ${statusDot}"></span></span>
                </div>
                <div class="card-row">
                    <span class="card-label">Portas</span>
                    <span>${doorsCount} porta${doorsCount !== 1 ? 's' : ''}</span>
                </div>
            </div>
            <div class="card-footer">
                ${deleteButton}
                <button class="btn-card-action btn-card-edit" title="Editar usuario" onclick="openEditUserModal('${user.id}')">
                    <i class="fas fa-pencil-alt"></i>
                </button>
            </div>
        </div>
    `;
}

function canDeleteUser(user) {
    if (!AppData.currentUser || !user) return false;
    if (user.id === AppData.currentUser.id) return false;
    if (user.type === 1) return false;
    return true;
}

async function deleteUser(id) {
    const user = AppData.getUserById(id);
    if (!user) return;
    if (!canDeleteUser(user)) {
        alert('Nao e permitido excluir o proprio usuario nem outros administradores.');
        return;
    }
    if (!confirm(`Excluir o usuario "${user.name}"?`)) return;

    try {
        await AppData.deleteUser(id);
        await AppData.refreshAll();
        renderUsers();
        renderDoors();
        renderReports();
    } catch (error) {
        handleError(error);
    }
}

function openAddUserModal() {
    ['new-user-name', 'new-user-email', 'new-user-password'].forEach(id => {
        document.getElementById(id).value = '';
    });
    document.getElementById('new-user-type').value = '0';
    openModal('modal-add-user');
}

async function addUser() {
    const name = document.getElementById('new-user-name').value.trim();
    const email = document.getElementById('new-user-email').value.trim();
    const password = document.getElementById('new-user-password').value;
    const type = parseInt(document.getElementById('new-user-type').value, 10);

    if (!name || !email || !password) {
        alert('Preencha todos os campos.');
        return;
    }

    try {
        await AppData.createUser({ name, email, password, type });
        await AppData.refreshAll();
        closeModal('modal-add-user');
        renderUsers();
    } catch (error) {
        handleError(error);
    }
}

function openEditUserModal(id) {
    const user = AppData.getUserById(id);
    if (!user) return;

    _editingUserId = id;
    document.getElementById('edit-user-id').value = id;
    document.getElementById('edit-user-name').value = user.name;
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-type').value = user.type;
    document.getElementById('edit-user-status').value = user.status;

    refreshUserDoorsTable(id);
    openModal('modal-edit-user');
}

function refreshUserDoorsTable(userId) {
    const tbody = document.getElementById('user-doors-tbody');
    const doors = AppData.getDoorsForUser(userId, { includeBlocked: true });

    if (doors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-table">Nenhuma porta vinculada</td></tr>';
        return;
    }

    tbody.innerHTML = doors.map(door => `
        <tr>
            <td>${door.name}${door.blocked ? ' (bloqueada)' : ''}</td>
            <td>
                <button class="btn-table-action btn-table-delete" onclick="removeDoorFromUser('${userId}', ${door.id})" title="Remover acesso">
                    <i class="fas fa-times"></i> Excluir
                </button>
                <button class="btn-table-action btn-table-block" onclick="toggleDoorBlock('${userId}', ${door.id})" title="Bloquear ou liberar acesso">
                    <i class="fas fa-ban"></i> ${door.blocked ? 'Desbloquear' : 'Bloquear'}
                </button>
            </td>
        </tr>
    `).join('');
}

async function removeDoorFromUser(userId, doorId) {
    try {
        await AppData.removeDoorFromUser(userId, doorId);
        await AppData.refreshAll();
        refreshUserDoorsTable(userId);
        renderUsers();
        renderDoors();
    } catch (error) {
        handleError(error);
    }
}

async function toggleDoorBlock(userId, doorId) {
    try {
        await AppData.toggleDoorBlock(userId, doorId);
        await AppData.refreshAll();
        refreshUserDoorsTable(userId);
        renderUsers();
        renderDoors();
    } catch (error) {
        handleError(error);
    }
}

function openLinkDoorModal() {
    const user = AppData.getUserById(_editingUserId);
    if (!user) return;

    const relatedDoorIds = AppData.doorRelations
        .filter(relation => relation.userId === user.id)
        .map(relation => relation.doorId);

    const availableDoors = AppData.doors.filter(door => !relatedDoorIds.includes(door.id));
    const select = document.getElementById('link-door-select');

    select.innerHTML = availableDoors.length
        ? availableDoors.map(door => `<option value="${door.id}">${door.name}</option>`).join('')
        : '<option disabled>Todas as portas ja estao vinculadas</option>';

    openModal('modal-link-door');
}

async function linkDoorToUser() {
    const doorId = parseInt(document.getElementById('link-door-select').value, 10);
    if (!_editingUserId || Number.isNaN(doorId)) return;

    try {
        await AppData.linkDoorToUser(_editingUserId, doorId);
        await AppData.refreshAll();
        closeModal('modal-link-door');
        refreshUserDoorsTable(_editingUserId);
        renderUsers();
        renderDoors();
    } catch (error) {
        handleError(error);
    }
}

async function saveUser() {
    const id = document.getElementById('edit-user-id').value;
    const user = AppData.getUserById(id);
    if (!user) return;

    const payload = {
        name: document.getElementById('edit-user-name').value.trim() || user.name,
        email: document.getElementById('edit-user-email').value.trim() || user.email,
        type: parseInt(document.getElementById('edit-user-type').value, 10),
        status: document.getElementById('edit-user-status').value,
    };

    try {
        await AppData.updateUser(id, payload);
        await AppData.refreshAll();
        closeModal('modal-edit-user');
        renderUsers();
        renderDoors();
    } catch (error) {
        handleError(error);
    }
}
