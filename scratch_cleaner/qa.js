const puppeteer = require('puppeteer');
const fs = require('fs');

async function runQA() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Desktop QA
    await page.setViewport({ width: 1440, height: 900 });
    
    // Set token to bypass auth redirects
    await page.goto('http://127.0.0.1:4173/english');
    await page.evaluate(() => localStorage.setItem('vortex-english-token', 'dummy'));

    const routes = [
        '/english',
        '/english/login',
        '/english/signup',
        '/english/account',
        '/english/materials',
        '/english/vocabulary',
        '/admin'
    ];

    const qaResults = [];
    let tokens = {};

    for (let route of routes) {
        let url = `http://127.0.0.1:4173${route}`;
        await page.goto(url, { waitUntil: 'networkidle2' });
        
        // Extract Tokens from the first page
        if (route === '/english') {
            tokens = await page.evaluate(() => {
                const styles = getComputedStyle(document.documentElement);
                const props = ['--ink','--navy','--blue','--blue-dark','--blue-soft','--orange','--amber','--green','--paper','--canvas','--warm','--line','--line-strong','--muted','--success','--danger','--shadow-sm','--shadow','--shadow-blue','--radius'];
                let res = {};
                for(let p of props) res[p] = styles.getPropertyValue(p).trim();
                return res;
            });
        }
        
        // Check for layout overflow Desktop
        let overflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });
        if (overflow) qaResults.push({ route, viewport: '1440x900', issue: 'Horizontal overflow', severity: 'High', selector: 'body' });
        
        // Check for specific issues
        let issues = await page.evaluate((r) => {
            let res = [];
            
            // Check focus styles
            let a = document.querySelector('a');
            if (a) {
                let fs = getComputedStyle(a);
                // Can't easily test focus ring this way, but we know it's in css
            }
            
            // Look for AI-generated patterns or unstyled elements
            if (document.querySelectorAll('div > div > div > div > div > div').length > 5) {
                res.push({ issue: 'Deep nesting/AI generated div soup', selector: 'div', severity: 'Medium' });
            }
            // Forms missing labels
            document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])').forEach(inp => {
                if (!inp.id) return;
                let lbl = document.querySelector(`label[for="${inp.id}"]`);
                let parentLbl = inp.closest('label');
                if (!lbl && !parentLbl && !inp.getAttribute('aria-label')) {
                    res.push({ issue: 'Input missing label', selector: `#${inp.id}`, severity: 'High' });
                }
            });

            // Empty states check
            let emptyContainers = document.querySelectorAll('.empty');
            if (r === '/english/materials' && emptyContainers.length === 0) {
                 res.push({ issue: 'Missing empty state for materials', selector: '.resource-list', severity: 'Medium' });
            }

            // Contrast checking (basic)
            document.querySelectorAll('p, span, small').forEach(el => {
                let s = getComputedStyle(el);
                if (s.color === s.backgroundColor && s.color !== 'rgba(0, 0, 0, 0)' && s.opacity !== '0') {
                    res.push({ issue: 'Poor contrast (same color as background)', selector: el.tagName.toLowerCase(), severity: 'Critical' });
                }
            });
            return res;
        }, route);
        
        issues.forEach(i => qaResults.push({ route, viewport: '1440x900', ...i }));

        // Mobile QA
        await page.setViewport({ width: 390, height: 844 });
        await page.waitForTimeout(500); // let layout settle
        
        let mOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });
        if (mOverflow) qaResults.push({ route, viewport: '390x844', issue: 'Horizontal overflow (breaks mobile)', severity: 'Critical', selector: 'body or large fixed width child' });
        
        let mIssues = await page.evaluate(() => {
            let res = [];
            // Check for hardcoded widths
            document.querySelectorAll('*').forEach(el => {
                let s = getComputedStyle(el);
                let w = parseFloat(s.width);
                if (w > 390 && s.display !== 'none' && el.tagName !== 'HTML' && el.tagName !== 'BODY') {
                    res.push({ issue: `Element wider than viewport (${w}px)`, selector: el.className || el.tagName, severity: 'High' });
                }
            });
            // Check sidebar/navigation accessibility on mobile
            let sidebar = document.querySelector('.member-sidebar');
            if (sidebar) {
                let s = getComputedStyle(sidebar);
                if (s.display !== 'none' && s.transform === 'matrix(1, 0, 0, 1, 0, 0)' && parseFloat(s.width) > 390) {
                     res.push({ issue: 'Sidebar overflows mobile screen', selector: '.member-sidebar', severity: 'High' });
                }
            }
            return res;
        });
        mIssues.forEach(i => qaResults.push({ route, viewport: '390x844', ...i }));
        
        await page.setViewport({ width: 1440, height: 900 });
    }

    fs.writeFileSync('qa-results.json', JSON.stringify({ qaResults, tokens }, null, 2));
    await browser.close();
}

runQA().catch(console.error);
