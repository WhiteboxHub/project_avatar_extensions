// setup.js
document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api-url');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('login-btn');
    const statusDiv = document.getElementById('status');
    const closeLink = document.getElementById('manual-close');

    closeLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.close();
    });

    loginBtn.addEventListener('click', async () => {
        let inputUrl = apiUrlInput.value.trim().replace(/\/$/, "");
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();

        if (!email || !password) {
            showStatus('Please enter both email and password', 'error');
            return;
        }

        loginBtn.disabled = true;
        showStatus('Authenticating...', 'info');
        
        const cleanBaseUrl = inputUrl.replace(/\/api$/, "").replace(/\/$/, "");
        const apiRoot = cleanBaseUrl + "/api";

        try {
            
            const loginResponse = await fetch(`${apiRoot}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    'username': email,
                    'password': password
                })
            });

            if (!loginResponse.ok) {
                const errData = await loginResponse.json().catch(() => ({}));
                throw new Error(errData.detail || `Login failed (${loginResponse.status}). Check credentials.`);
            }

            const loginData = await loginResponse.json();
            const token = loginData.access_token;

            showStatus('Syncing profile...', 'info');
            const dashboardResponse = await fetch(`${apiRoot}/user_dashboard`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!dashboardResponse.ok) {
                throw new Error('Authenticated but failed to fetch dashboard info.');
            }

            const userData = await dashboardResponse.json();
            const userEmail = userData.uname; 

            
            showStatus('Locating Employee record...', 'info');
            const empResponse = await fetch(`${apiRoot}/employees`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            let employeeId = null;
            if (empResponse.ok) {
                const employees = await empResponse.json();
                const matchedEmp = employees.find(e => e.email && e.email.toLowerCase() === userEmail.toLowerCase());
                if (matchedEmp) {
                    employeeId = matchedEmp.id;
                }
            }

            if (!employeeId) {
                throw new Error('Could not find an Employee record matching your email. Please enter your ID manually in the popup.');
            }

            
            await chrome.storage.local.set({
                apiUrl: inputUrl,
                apiToken: token,
                employeeId: employeeId.toString()
            });

            showStatus(`Success! Synced Employee ID: ${employeeId}. Redirecting...`, 'success');

            setTimeout(() => {
                window.close();
            }, 2000);

        } catch (error) {
            console.error(error);
            showStatus(error.message, 'error');
        } finally {
            loginBtn.disabled = false;
        }
    });

    function showStatus(text, type) {
        statusDiv.innerText = text;
        statusDiv.className = type;
    }
});
