/* ============================================================
   AUTH.JS - Controle de perfil e autenticacao
   ============================================================ */

const SESSION_USER_ID_KEY = 'iot_access_user_id';
const SESSION_USER_NAME_KEY = 'iot_access_user_name';
const APP_PAGE = 'index.html';
const LOGIN_PAGE = 'login.html';

function getAppPageUrl() {
    return new URL(APP_PAGE, window.location.href).toString();
}

function getLoginPageUrl() {
    return new URL(LOGIN_PAGE, window.location.href).toString();
}

function saveUserSession() {
    if (!AppData.currentUser) return;

    sessionStorage.setItem(SESSION_USER_ID_KEY, AppData.currentUser.id);
    sessionStorage.setItem(SESSION_USER_NAME_KEY, AppData.currentUser.name);
}

function clearUserSession() {
    sessionStorage.removeItem(SESSION_USER_ID_KEY);
    sessionStorage.removeItem(SESSION_USER_NAME_KEY);
}

function redirectToApp() {
    window.location.replace(getAppPageUrl());
}

function redirectToLogin() {
    window.location.replace(getLoginPageUrl());
}

function setLoginMessage(message = '') {
    const messageElement = document.getElementById('login-message');
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.style.display = message ? 'block' : 'none';
}

function setLoginLoading(isLoading) {
    const button = document.getElementById('login-submit');
    const buttonText = document.getElementById('login-submit-text');

    if (!button || !buttonText) return;

    button.disabled = isLoading;
    buttonText.textContent = isLoading ? 'Entrando...' : 'Entrar';
}

function applyRoleUI() {
    const isAdmin = AppData.currentUser?.type === 1;
    const currentName = AppData.currentUser?.name || 'Usuario';
    const headerUsername = document.getElementById('header-username');
    const sidebarUsername = document.getElementById('sidebar-username');
    const headerRole = document.getElementById('header-role');

    if (headerUsername) headerUsername.textContent = currentName;
    if (sidebarUsername) sidebarUsername.textContent = currentName.split(' ')[0];
    if (headerRole) headerRole.textContent = isAdmin ? 'Painel de Controle' : 'Acesso ao Sistema';

    document.querySelectorAll('.admin-only').forEach(element => {
        element.style.display = isAdmin ? '' : 'none';
    });

    if (!isAdmin) {
        closeAllModals();
        document.querySelectorAll('.data-section').forEach(section => {
            section.classList.toggle('active', section.id === 'section-doors');
        });
        document.querySelectorAll('.sidebar .nav-item[id^="nav-"]').forEach(item => {
            item.classList.toggle('active', item.id === 'nav-doors');
        });
    }
}

async function requireAuthenticatedSession() {
    await AppData.setupClient();

    const { data, error } = await AppData.supabase.auth.getSession();
    if (error) throw error;

    if (!data?.session) {
        clearUserSession();
        redirectToLogin();
        return null;
    }

    return data.session;
}

async function redirectIfAuthenticated() {
    await AppData.setupClient();

    const { data, error } = await AppData.supabase.auth.getSession();
    if (error) throw error;

    if (data?.session) {
        redirectToApp();
        return true;
    }

    return false;
}

async function login(event) {
    event.preventDefault();

    try {
        await AppData.setupClient();
        setLoginMessage('');

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            throw new Error('Informe e-mail e senha.');
        }

        setLoginLoading(true);

        const { data, error } = await AppData.supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) throw error;
        if (!data?.session) {
            throw new Error('Login realizado sem sessao ativa. Tente novamente.');
        }

        const user = data.user;
        const userName =
            user?.user_metadata?.name ||
            user?.user_metadata?.nome ||
            user?.email ||
            'Usuario';

        sessionStorage.setItem(SESSION_USER_ID_KEY, user.id);
        sessionStorage.setItem(SESSION_USER_NAME_KEY, userName);
        redirectToApp();
    } catch (error) {
        console.error(error);
        setLoginMessage(error?.message || 'Nao foi possivel autenticar.');
    } finally {
        setLoginLoading(false);
    }
}

function initializeAuthUI() {
    const form = document.getElementById('login-form');
    if (!form || form.dataset.bound === 'true') return;

    form.addEventListener('submit', login);
    form.dataset.bound = 'true';
}

async function logout() {
    if (!confirm('Deseja realmente sair?')) return;

    try {
        if (AppData.supabase) {
            const { error } = await AppData.supabase.auth.signOut();
            if (error) throw error;
        }
    } catch (error) {
        alert(error?.message || 'Nao foi possivel encerrar a sessao.');
        return;
    }

    clearUserSession();
    redirectToLogin();
}

function initializePanicButton() {
    const panicBtn = document.getElementById('panic-btn');
    if (!panicBtn || panicBtn.dataset.bound === 'true') return;

    panicBtn.addEventListener('click', () => {
        panicBtn.classList.toggle('active');
        const isActive = panicBtn.classList.contains('active');
        document.getElementById('panic-text').textContent = isActive ? 'BLOQUEIO ATIVO' : 'Modo Seguranca';

        if (isActive) {
            alert('MODO DE EMERGENCIA: todos os atuadores foram travados.');
        }
    });

    panicBtn.dataset.bound = 'true';
}
