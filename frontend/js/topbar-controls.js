(function(){
        function applyTheme(dark){
          dark = Boolean(dark);
          try { localStorage.setItem('darkMode', String(dark)); } catch (_) {}
          document.documentElement.classList.toggle('dark-mode', dark);
          document.body.classList.toggle('dark-mode', dark);
          var checkbox = document.getElementById('darkModeToggle');
          if (checkbox) checkbox.checked = dark;
          document.querySelectorAll('#topbarThemeToggle,#mobileThemeToggle').forEach(function(button){
            button.setAttribute('aria-pressed', String(dark));
            button.setAttribute('title', dark ? 'Switch to light mode' : 'Switch to dark mode');
          });
          window.dispatchEvent(new CustomEvent('rental-theme-change', {detail:{dark:dark}}));
        }
        window.setRentalTheme = applyTheme;
        applyTheme((function(){ try { return localStorage.getItem('darkMode') === 'true'; } catch (_) { return false; } })());

        // Use one delegated handler for both desktop and mobile controls, including
        // controls recreated by dashboard rendering.
        document.addEventListener('click', function(e){
          var button = e.target && e.target.closest ? e.target.closest('#topbarThemeToggle,#mobileThemeToggle') : null;
          if (!button) return;
          e.preventDefault();
          e.stopPropagation();
          var currentDark = document.documentElement.classList.contains('dark-mode') || document.body.classList.contains('dark-mode');
          var nextDark = !currentDark;
          var setting = document.getElementById('darkModeToggle');
          if (setting) {
            setting.checked = nextDark;
            // Settings owns the same change pathway; dispatch it so both controls
            // always use the exact same preference/update logic.
            setting.dispatchEvent(new Event('change', {bubbles:true}));
          }
          applyTheme(nextDark);
        }, true);

        document.addEventListener('change', function(e){
          if (e.target && e.target.id === 'darkModeToggle') applyTheme(Boolean(e.target.checked));
        }, true);

        // Home must always return to the actual landing view, even when the
        // dashboard/demo state is active or the URL already contains showHome.
        document.addEventListener('click', function(e){
          var button = e.target && e.target.closest ? e.target.closest('#dashboardHomeBtn') : null;
          if (!button) return;
          e.preventDefault();
          e.stopPropagation();
          try { if (window.Auth && typeof Auth.stopDemo === 'function') Auth.stopDemo(); } catch (_) {}
          var target = new URL(window.location.href);
          target.search = '?showHome=1';
          target.hash = '';
          if (target.href === window.location.href || (location.pathname === target.pathname && location.search === '?showHome=1')) {
            window.location.reload();
          } else {
            window.location.assign(target.toString());
          }
        }, true);
      })();
