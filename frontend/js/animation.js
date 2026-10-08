(function() {
    const overlayItems = document.getElementById('overlayItems');
    const items = document.querySelectorAll('.hero-img .item');
    const dashboardMock = document.getElementById('dashboardMock');
    let interval = null;
    let currentIndex = 0;
    let dashboardStyleIndex = 0;
    let dashboardInterval = null;

    // 4 Completely Different Dashboard Styles
    const dashboardStyles = [
        // Style 0: PROPERTIES - Map/Grid view
        {
            html: `
                <div style="display:flex;flex-direction:column;width:100%;height:100%;padding:12px;gap:8px;background:rgba(248,247,245,0.92);border-radius:24px;backdrop-filter:blur(20px);">
                    <div style="display:flex;gap:8px;">
                        <div style="flex:1;background:rgba(255,255,255,0.6);border-radius:10px;padding:10px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.2rem;font-weight:600;color:#1a1a1a;">24</div>
                            <div style="height:3px;background:rgba(0,0,0,0.08);border-radius:3px;width:60%;margin:3px auto;"></div>
                            <div style="font-size:0.6rem;color:#6b6b6b;">Total</div>
                        </div>
                        <div style="flex:1;background:rgba(255,255,255,0.6);border-radius:10px;padding:10px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.2rem;font-weight:600;color:#1a1a1a;">18</div>
                            <div style="height:3px;background:rgba(0,0,0,0.08);border-radius:3px;width:60%;margin:3px auto;"></div>
                            <div style="font-size:0.6rem;color:#6b6b6b;">Occupied</div>
                        </div>
                        <div style="flex:1;background:rgba(255,255,255,0.6);border-radius:10px;padding:10px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.2rem;font-weight:600;color:#1a1a1a;">6</div>
                            <div style="height:3px;background:rgba(0,0,0,0.08);border-radius:3px;width:60%;margin:3px auto;"></div>
                            <div style="font-size:0.6rem;color:#6b6b6b;">Vacant</div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                        <div style="background:rgba(255,255,255,0.4);border-radius:8px;padding:8px;border:1px solid rgba(0,0,0,0.04);">
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:70%;"></div>
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:40%;margin-top:4px;"></div>
                        </div>
                        <div style="background:rgba(255,255,255,0.4);border-radius:8px;padding:8px;border:1px solid rgba(0,0,0,0.04);">
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:50%;"></div>
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:60%;margin-top:4px;"></div>
                        </div>
                        <div style="background:rgba(255,255,255,0.4);border-radius:8px;padding:8px;border:1px solid rgba(0,0,0,0.04);">
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:80%;"></div>
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:30%;margin-top:4px;"></div>
                        </div>
                        <div style="background:rgba(255,255,255,0.4);border-radius:8px;padding:8px;border:1px solid rgba(0,0,0,0.04);">
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:55%;"></div>
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:45%;margin-top:4px;"></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;height:20px;">
                        <div style="flex:1;background:rgba(0,0,0,0.04);border-radius:4px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.07);border-radius:4px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.04);border-radius:4px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.09);border-radius:4px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.04);border-radius:4px;"></div>
                    </div>
                </div>
            `
        },
        // Style 1: TENANTS - List/Profile view
        {
            html: `
                <div style="display:flex;flex-direction:column;width:100%;height:100%;padding:12px;gap:6px;background:rgba(248,247,245,0.92);border-radius:24px;backdrop-filter:blur(20px);">
                    <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.4);border-radius:8px;padding:8px 10px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.06);flex-shrink:0;"></div>
                        <div style="flex:1;"><div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:60%;"></div><div style="height:3px;background:rgba(0,0,0,0.04);border-radius:3px;width:40%;margin-top:3px;"></div></div>
                        <div style="width:40px;height:4px;background:rgba(0,0,0,0.06);border-radius:3px;"></div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.4);border-radius:8px;padding:8px 10px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.08);flex-shrink:0;"></div>
                        <div style="flex:1;"><div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:45%;"></div><div style="height:3px;background:rgba(0,0,0,0.04);border-radius:3px;width:55%;margin-top:3px;"></div></div>
                        <div style="width:40px;height:4px;background:rgba(0,0,0,0.06);border-radius:3px;"></div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.4);border-radius:8px;padding:8px 10px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.06);flex-shrink:0;"></div>
                        <div style="flex:1;"><div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:70%;"></div><div style="height:3px;background:rgba(0,0,0,0.04);border-radius:3px;width:30%;margin-top:3px;"></div></div>
                        <div style="width:40px;height:4px;background:rgba(0,0,0,0.06);border-radius:3px;"></div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.4);border-radius:8px;padding:8px 10px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="width:28px;height:28px;border-radius:50%;background:rgba(0,0,0,0.09);flex-shrink:0;"></div>
                        <div style="flex:1;"><div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:50%;"></div><div style="height:3px;background:rgba(0,0,0,0.04);border-radius:3px;width:45%;margin-top:3px;"></div></div>
                        <div style="width:40px;height:4px;background:rgba(0,0,0,0.06);border-radius:3px;"></div>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:4px;">
                        <div style="flex:1;text-align:center;background:rgba(255,255,255,0.4);border-radius:8px;padding:6px;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">42</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:50%;margin:2px auto;"></div>
                            <div style="font-size:0.55rem;color:#6b6b6b;">Total</div>
                        </div>
                        <div style="flex:1;text-align:center;background:rgba(255,255,255,0.4);border-radius:8px;padding:6px;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">12</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:50%;margin:2px auto;"></div>
                            <div style="font-size:0.55rem;color:#6b6b6b;">New</div>
                        </div>
                    </div>
                </div>
            `
        },
        // Style 2: PAYMENTS - Transaction/Receipt view
        {
            html: `
                <div style="display:flex;flex-direction:column;width:100%;height:100%;padding:12px;gap:6px;background:rgba(248,247,245,0.92);border-radius:24px;backdrop-filter:blur(20px);">
                    <div style="display:flex;gap:8px;">
                        <div style="flex:1;background:rgba(255,255,255,0.6);border-radius:10px;padding:8px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">$8.4k</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:50%;margin:2px auto;"></div>
                            <div style="font-size:0.55rem;color:#6b6b6b;">This Month</div>
                        </div>
                        <div style="flex:1;background:rgba(255,255,255,0.6);border-radius:10px;padding:8px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">32</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:50%;margin:2px auto;"></div>
                            <div style="font-size:0.55rem;color:#6b6b6b;">Paid</div>
                        </div>
                        <div style="flex:1;background:rgba(255,255,255,0.6);border-radius:10px;padding:8px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">10</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:50%;margin:2px auto;"></div>
                            <div style="font-size:0.55rem;color:#6b6b6b;">Pending</div>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;background:rgba(255,255,255,0.3);border-radius:8px;padding:8px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div><div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:60px;"></div><div style="height:3px;background:rgba(0,0,0,0.04);border-radius:3px;width:40px;margin-top:2px;"></div></div>
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:50px;"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div><div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:50px;"></div><div style="height:3px;background:rgba(0,0,0,0.04);border-radius:3px;width:55px;margin-top:2px;"></div></div>
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:45px;"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div><div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:70px;"></div><div style="height:3px;background:rgba(0,0,0,0.04);border-radius:3px;width:35px;margin-top:2px;"></div></div>
                            <div style="height:4px;background:rgba(0,0,0,0.06);border-radius:3px;width:55px;"></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:4px;height:18px;">
                        <div style="flex:1;background:rgba(0,0,0,0.05);border-radius:3px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.08);border-radius:3px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.12);border-radius:3px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.05);border-radius:3px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.09);border-radius:3px;"></div>
                    </div>
                </div>
            `
        },
        // Style 3: REPORTS - Charts & Analytics
        {
            html: `
                <div style="display:flex;flex-direction:column;width:100%;height:100%;padding:12px;gap:6px;background:rgba(248,247,245,0.92);border-radius:24px;backdrop-filter:blur(20px);">
                    <div style="display:flex;gap:6px;">
                        <div style="flex:1;background:rgba(255,255,255,0.4);border-radius:8px;padding:6px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">87%</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:60%;margin:2px auto;"></div>
                            <div style="font-size:0.5rem;color:#6b6b6b;">Occupancy</div>
                        </div>
                        <div style="flex:1;background:rgba(255,255,255,0.4);border-radius:8px;padding:6px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">+12%</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:60%;margin:2px auto;"></div>
                            <div style="font-size:0.5rem;color:#6b6b6b;">Growth</div>
                        </div>
                        <div style="flex:1;background:rgba(255,255,255,0.4);border-radius:8px;padding:6px;text-align:center;border:1px solid rgba(0,0,0,0.04);">
                            <div style="font-size:1.1rem;font-weight:600;color:#1a1a1a;">94%</div>
                            <div style="height:2px;background:rgba(0,0,0,0.06);border-radius:3px;width:60%;margin:2px auto;"></div>
                            <div style="font-size:0.5rem;color:#6b6b6b;">Collection</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:4px;height:45px;align-items:flex-end;padding:4px 0;background:rgba(255,255,255,0.2);border-radius:8px;padding:8px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="flex:1;background:rgba(0,0,0,0.08);border-radius:3px 3px 0 0;height:20px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.15);border-radius:3px 3px 0 0;height:35px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.06);border-radius:3px 3px 0 0;height:12px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.18);border-radius:3px 3px 0 0;height:42px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.10);border-radius:3px 3px 0 0;height:28px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.20);border-radius:3px 3px 0 0;height:45px;"></div>
                        <div style="flex:1;background:rgba(0,0,0,0.07);border-radius:3px 3px 0 0;height:16px;"></div>
                    </div>
                    <div style="display:flex;gap:4px;">
                        <div style="flex:1;height:4px;background:rgba(0,0,0,0.04);border-radius:3px;"></div>
                        <div style="flex:1;height:4px;background:rgba(0,0,0,0.08);border-radius:3px;"></div>
                        <div style="flex:1;height:4px;background:rgba(0,0,0,0.04);border-radius:3px;"></div>
                        <div style="flex:1;height:4px;background:rgba(0,0,0,0.06);border-radius:3px;"></div>
                    </div>
                </div>
            `
        }
    ];

    // Dashboard animations
    function animateDashboard() {
        const dashCards = document.querySelectorAll('.dash-card');
        const dashBars = document.querySelectorAll('.dash-chart .bar');
        const dashSidebar = document.querySelector('.dash-sidebar');

        if (dashSidebar) {
            const sidebarItems = dashSidebar.querySelectorAll('span');
            sidebarItems.forEach((el, i) => {
                el.style.animation = `none`;
                setTimeout(() => {
                    el.style.animation = `sidebarPulse 0.6s ease ${i * 0.15}s forwards`;
                }, 10);
            });
        }

        dashCards.forEach((card, i) => {
            card.style.animation = `none`;
            setTimeout(() => {
                card.style.animation = `cardSlideUp 0.5s ease ${i * 0.15}s forwards`;
                card.style.opacity = '0';
            }, 10);
        });

        dashBars.forEach((bar, i) => {
            bar.style.animation = `none`;
            setTimeout(() => {
                bar.style.animation = `barGrow 0.6s ease ${i * 0.1}s forwards`;
                bar.style.transform = 'scaleY(0)';
            }, 10);
        });
    }

    // Add CSS animations dynamically
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes sidebarPulse {
            0% { transform: scale(0.8); opacity: 0.3; }
            50% { transform: scale(1.15); opacity: 0.6; }
            100% { transform: scale(1); opacity: 0.4; }
        }

        @keyframes cardSlideUp {
            0% { transform: translateY(20px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
        }

        @keyframes barGrow {
            0% { transform: scaleY(0); opacity: 0; }
            100% { transform: scaleY(1); opacity: 1; }
        }

        .dash-card {
            opacity: 0;
        }

        .dash-chart .bar {
            transform-origin: bottom;
            transform: scaleY(0);
        }

        .dash-sidebar span {
            opacity: 0.3;
            transform: scale(1);
        }

        .dashboard-mock {
            transition: opacity 0.5s ease;
        }

        .dashboard-mock.fade-out {
            opacity: 0;
        }

        .dashboard-mock.fade-in {
            opacity: 1;
        }
    `;
    document.head.appendChild(styleSheet);

    // Change dashboard style
    function changeDashboardStyle() {
        if (!dashboardMock) return;
        
        dashboardMock.classList.add('fade-out');
        dashboardMock.classList.remove('fade-in');
        
        setTimeout(() => {
            dashboardMock.innerHTML = dashboardStyles[dashboardStyleIndex].html;
            dashboardMock.classList.remove('fade-out');
            dashboardMock.classList.add('fade-in');
            setTimeout(animateDashboard, 100);
            dashboardStyleIndex = (dashboardStyleIndex + 1) % dashboardStyles.length;
        }, 300);
    }

    // Start dashboard rotation
    function startDashboardRotation() {
        if (dashboardInterval) clearInterval(dashboardInterval);
        dashboardInterval = setInterval(changeDashboardStyle, 3000);
    }

    function stopDashboardRotation() {
        if (dashboardInterval) {
            clearInterval(dashboardInterval);
            dashboardInterval = null;
        }
    }

    function setActive(index) {
        items.forEach((el, i) => {
            el.classList.toggle('active-item', i === index);
        });
        if (dashboardStyleIndex !== index) {
            dashboardStyleIndex = index;
            changeDashboardStyle();
        }
    }
    setActive(0);

    function nextItem() {
        currentIndex = (currentIndex + 1) % items.length;
        setActive(currentIndex);
    }

    function startIconRotation() {
        if (interval) clearInterval(interval);
        interval = setInterval(nextItem, 3000);
    }

    function stopIconRotation() {
        if (interval) { clearInterval(interval); interval = null; }
    }

    startIconRotation();
    startDashboardRotation();

    setTimeout(() => {
        if (dashboardMock) {
            dashboardMock.innerHTML = dashboardStyles[0].html;
            setTimeout(animateDashboard, 100);
        }
    }, 100);

    const container = document.getElementById('heroIcons');
    if (container) {
        container.addEventListener('mouseenter', () => {
            stopIconRotation();
            stopDashboardRotation();
        });
        container.addEventListener('mouseleave', () => {
            startIconRotation();
            startDashboardRotation();
        });
    }
})();