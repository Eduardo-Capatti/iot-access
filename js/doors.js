/* ============================================================
   DOORS.JS - Gerenciamento de Portas
   ============================================================ */

function renderDoors(filter = '') {
    const grid = document.getElementById('doors-grid');
    if (!grid) return;

    const isAdmin = AppData.currentUser.type === 1;
    let doors = isAdmin
        ? AppData.doors
        : AppData.getDoorsForUser(AppData.currentUser.id);

    if (filter) {
        const query = filter.toLowerCase();
        doors = doors.filter(door => door.name.toLowerCase().includes(query));
    }

    if (doors.length === 0) {
        grid.innerHTML = '<p style="color:#555; grid-column:1/-1; text-align:center; padding:40px;">Nenhuma porta encontrada.</p>';
        return;
    }

    grid.innerHTML = doors.map(door => buildDoorCard(door, isAdmin)).join('');
}

function buildDoorCard(door, isAdmin) {
    const isOpen = door.status === 'open';
    const dotClass = isOpen ? 'dot-open' : 'dot-closed';
    const statusLabel = isOpen ? 'Aberta' : 'Fechada';
    const usersCount = AppData.getUsersForDoor(door.id).length;

    const adminActions = isAdmin ? `
        <button class="btn-card-action btn-card-delete" title="Excluir porta" onclick="deleteDoor(${door.id})">
            <i class="fas fa-trash-alt"></i>
        </button>
        <button class="btn-card-action btn-card-edit" title="Editar porta" onclick="openEditDoorModal(${door.id})">
            <i class="fas fa-pencil-alt"></i>
        </button>
    ` : '';

    return `
        <div class="card" id="door-card-${door.id}">
            <div class="card-header">
                <span>${door.name}</span>
            </div>
            <div class="card-body">
                <div class="card-row">
                    <span class="card-label">Status</span>
                    <span>${statusLabel} <span class="status-dot ${dotClass}"></span></span>
                </div>
                ${isAdmin ? `
                <div class="card-row">
                    <span class="card-label">Usuarios</span>
                    <span>${usersCount}</span>
                </div>` : ''}
            </div>
            <div class="card-footer">
                <div style="display:flex; gap:6px;">
                    ${adminActions}
                </div>
                <button
                    class="btn-card-unlock"
                    title="${isOpen ? 'Porta ja aberta' : 'Abrir porta'}"
                    onclick="unlockDoor(${door.id}, '${door.name.replace(/'/g, "\\'")}')"
                    ${isOpen ? 'disabled' : ''}
                >
                    <i class="fas ${isOpen ? 'fa-door-open' : 'fa-lock'}"></i>
                </button>
            </div>
        </div>
    `;
}

async function unlockDoor(id, name) {
    try {
        await AppData.registerAccess(id);
        await AppData.refreshAll();
        renderDoors();
        if (AppData.currentUser.type === 1) {
            renderUsers();
            renderReports();
        }
        alert(`A porta "${name}" foi aberta com sucesso.`);
    } catch (error) {
        handleError(error);
    }
}

async function deleteDoor(id) {
    if (!isAdminUser()) return;

    const door = AppData.getDoorById(id);
    if (!door) return;
    if (!confirm(`Excluir a porta "${door.name}"?`)) return;

    try {
        await AppData.deleteDoor(id);
        await AppData.refreshAll();
        renderDoors();
        if (AppData.currentUser.type === 1) {
            renderUsers();
            renderReports();
        }
    } catch (error) {
        handleError(error);
    }
}

function openAddDoorModal() {
    if (!isAdminUser()) return;

    document.getElementById('new-door-name').value = '';
    document.getElementById('new-door-status').value = 'closed';
    openModal('modal-add-door');
}

async function addDoor() {
    if (!isAdminUser()) return;

    const name = document.getElementById('new-door-name').value.trim();
    const status = document.getElementById('new-door-status').value;

    if (!name) {
        alert('Informe o nome da porta.');
        return;
    }

    try {
        await AppData.createDoor({ name, status });
        await AppData.refreshAll();
        closeModal('modal-add-door');
        renderDoors();
        if (AppData.currentUser.type === 1) {
            renderReports();
        }
    } catch (error) {
        handleError(error);
    }
}

function openEditDoorModal(id) {
    if (!isAdminUser()) return;

    const door = AppData.getDoorById(id);
    if (!door) return;

    document.getElementById('edit-door-id').value = id;
    document.getElementById('edit-door-name').value = door.name;
    document.getElementById('edit-door-status').value = door.status;

    const tbody = document.getElementById('door-users-tbody');
    const linkedUsers = AppData.getUsersForDoor(id, { includeBlocked: true });

    if (linkedUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="empty-table">Nenhum usuario vinculado</td></tr>';
    } else {
        tbody.innerHTML = linkedUsers.map(user => `
            <tr>
                <td>${user.name}${user.blocked ? ' (bloqueado)' : ''}</td>
                <td>
                    <button class="btn-table-action btn-table-delete" onclick="removeUserFromDoor('${user.id}', ${id})" title="Excluir acesso">
                        <i class="fas fa-user-times"></i> Excluir acesso
                    </button>
                </td>
            </tr>
        `).join('');
    }

    openModal('modal-edit-door');
}

async function removeUserFromDoor(userId, doorId) {
    if (!isAdminUser()) return;

    try {
        await AppData.removeDoorFromUser(userId, doorId);
        await AppData.refreshAll();
        openEditDoorModal(doorId);
        if (AppData.currentUser.type === 1) {
            renderUsers();
        }
    } catch (error) {
        handleError(error);
    }
}

async function saveDoor() {
    if (!isAdminUser()) return;

    const id = parseInt(document.getElementById('edit-door-id').value, 10);
    const door = AppData.getDoorById(id);
    if (!door) return;

    const name = document.getElementById('edit-door-name').value.trim() || door.name;
    const status = document.getElementById('edit-door-status').value;

    try {
        await AppData.updateDoor(id, { name, status });
        await AppData.refreshAll();
        closeModal('modal-edit-door');
        renderDoors();
        if (AppData.currentUser.type === 1) {
            renderReports();
        }
    } catch (error) {
        handleError(error);
    }
}
