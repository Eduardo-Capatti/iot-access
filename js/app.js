/* ============================================================
   APP.JS - Inicializacao, navegacao e controle de modais
   ============================================================ */

function handleError(error) {
    console.error(error);
    alert(error?.message || 'Ocorreu um erro ao comunicar com o Supabase.');
}

function isAdminUser() {
    return AppData.currentUser?.type === 1;
}

function switchTab(tabName) {
    if ((tabName === 'users' || tabName === 'reports') && !isAdminUser()) {
        tabName = 'doors';
    }

    document.querySelectorAll('.data-section').forEach(section => {
        section.classList.toggle('active', section.id === `section-${tabName}`);
    });

    document.querySelectorAll('.sidebar .nav-item[id^="nav-"]').forEach(item => {
        item.classList.toggle('active', item.id === `nav-${tabName}`);
    });

    if (tabName === 'doors') renderDoors();
    if (tabName === 'users') renderUsers();
    if (tabName === 'reports') renderReports();
}

function filterCards(section, value) {
    if (section !== 'doors' && !isAdminUser()) return;
    if (section === 'doors') renderDoors(value);
    if (section === 'users') renderUsers(value);
}

function openModal(modalId) {
    const adminModals = new Set([
        'modal-add-user',
        'modal-edit-user',
        'modal-add-door',
        'modal-edit-door',
        'modal-link-door',
    ]);
    if (adminModals.has(modalId) && !isAdminUser()) return;

    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.classList.remove('active');

    const hasOpenModal = document.querySelector('.modal-overlay.active');
    document.body.style.overflow = hasOpenModal ? 'hidden' : '';
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
        modal.classList.remove('active');
    });

    document.body.style.overflow = '';
}

function initializeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeAllModals();
        }
    });
}

async function initializeApp() {
    try {
        initializeModals();
        const session = await requireAuthenticatedSession();
        if (!session) return;
        await AppData.initialize();
        saveUserSession();
        applyRoleUI();
        initializePanicButton();
        switchTab('doors');

        if (isAdminUser()) {
            renderUsers();
            renderReports();
        }
    } catch (error) {
        handleError(error);
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);
