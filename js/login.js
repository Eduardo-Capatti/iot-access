/* ============================================================
   LOGIN.JS - Inicializacao da pagina de login
   ============================================================ */

async function initializeLoginPage() {
    try {
        initializeAuthUI();
        const hasSession = await redirectIfAuthenticated();
        if (hasSession) return;
    } catch (error) {
        console.error(error);
        setLoginMessage(error?.message || 'Nao foi possivel validar a sessao.');
    }
}

document.addEventListener('DOMContentLoaded', initializeLoginPage);
