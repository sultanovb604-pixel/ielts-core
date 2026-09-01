const fs = require('fs');
let code = fs.readFileSync('english-site.js', 'utf8');

const target = \<a class="member-sidebar-profile" href="/english/account" aria-label="Open student dashboard">
            <span class="member-avatar">\</span>\;

const replacement = \<div style="display:flex; align-items:center; gap:6px;">
            <button type="button" id="sidebarThemeToggleBtn" title="Toggle dark mode" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:inherit; cursor:pointer; padding:8px; border-radius:10px; display:flex; align-items:center; justify-content:center; transition:0.2s;">
              <span class="material-symbols-outlined" style="font-size:20px;">light_mode</span>
            </button>
            <a class="member-sidebar-profile" href="/english/account" aria-label="Open student dashboard" style="flex:1; margin-top:0;">
            <span class="member-avatar">\</span>\;

code = code.replace(target, replacement);

const targetEnd = </span>
          </a>
        </div>
      \;;
      
const replacementEnd = </span>
          </a>
          </div>
        </div>
      \;;
      
code = code.replace(targetEnd, replacementEnd);

// Add event listener logic inside mountMemberSidebar
const targetListener = const isInitiallyCollapsed = localStorage.getItem('vortex-sidebar-collapsed') === 'true';;
const replacementListener = 
      const stBtn = sidebar.querySelector('#sidebarThemeToggleBtn');
      if (stBtn) {
        const updateStBtn = () => {
          const isDark = document.documentElement.dataset.theme === 'dark';
          stBtn.querySelector('span').textContent = isDark ? 'light_mode' : 'dark_mode';
        };
        updateStBtn();
        stBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const root = document.documentElement;
          root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
          localStorage.setItem('vortex-english-theme', root.dataset.theme);
          updateStBtn();
        });
      }

      const isInitiallyCollapsed = localStorage.getItem('vortex-sidebar-collapsed') === 'true';;

code = code.replace(targetListener, replacementListener);

fs.writeFileSync('english-site.js', code);
