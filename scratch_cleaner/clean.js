const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const sourceDir = path.join(__dirname, '..', 'english-reading-materials');
const stagingDir = path.join(__dirname, '..', 'staging', 'clean-reading');
const projectRoot = path.join(__dirname, '..');

if (!fs.existsSync(stagingDir)) {
    fs.mkdirSync(stagingDir, { recursive: true });
}

const files = fs.readdirSync(sourceDir);
const inventory = [];
const reportData = {
    totalHtml: 0,
    stagedCopies: 0,
    skipped: 0,
    brokenKeys: [],
    countChanged: [],
    thirdPartyDomains: new Set(),
    manualReview: []
};

function processHtmlFile(fileName, filePath) {
    reportData.totalHtml++;
    let content = fs.readFileSync(filePath, 'utf8');
    const $ = cheerio.load(content, { decodeEntities: false });

    // Initial counts
    const getPassageCount = () => {
        let count = $('.reading-passage').length;
        if (count === 0) count = $('h2:contains("Reading Passage")').length;
        if (count === 0) count = 1; // Fallback
        return count;
    };
    const getQuestionCount = () => {
        let q = $('input[type="text"], input[type="radio"], select').length;
        // sometimes radio buttons are grouped per question, so let's try to find question containers
        let qContainers = $('.question, .tf-question, .matching-form-row').length;
        if (qContainers > 0) return qContainers;
        return q;
    };
    const hasAnswerKey = () => {
        let has = false;
        $('script').each((i, el) => {
            if ($(el).html().toLowerCase().includes('const answers =') || $(el).html().toLowerCase().includes('var answers =') || $(el).html().toLowerCase().includes('let answers =')) has = true;
        });
        if ($('.correct-ans').length > 0) has = true;
        return has;
    };
    const hasSubmitLogic = () => {
        let has = false;
        if ($('.footer__deliverButton___3FM07').length > 0) has = true;
        if ($('button:contains("Submit"), button:contains("Check")').length > 0) has = true;
        return has;
    };
    const findTelegramLinks = () => {
        let links = [];
        $('a[href*="t.me"]').each((i, el) => links.push($(el).attr('href')));
        return links;
    };
    const findThirdPartyDomains = () => {
        let domains = [];
        $('script[src], link[href], a[href], img[src]').each((i, el) => {
            let url = $(el).attr('src') || $(el).attr('href');
            if (url && url.startsWith('http')) {
                try {
                    let d = new URL(url).hostname;
                    if (!d.includes('localhost') && !d.includes('vortex')) domains.push(d);
                } catch(e){}
            }
        });
        return domains;
    };

    const origPassageCount = getPassageCount();
    const origQuestionCount = getQuestionCount();
    const origHasKey = hasAnswerKey();
    const origHasSubmit = hasSubmitLogic();
    const origTelegramLinks = findTelegramLinks();
    const origThirdParty = findThirdPartyDomains();
    
    origThirdParty.forEach(d => reportData.thirdPartyDomains.add(d));

    let thirdPartyBranding = origTelegramLinks.length > 0 ? "Yes (Telegram)" : "No";

    // Clean up
    $('a[href*="t.me"]').remove();
    $('a:contains("Premium Service")').closest('div').remove(); // e.g. center-cta
    $('*').contents().filter(function() {
        return this.nodeType === 3 && this.nodeValue.includes('@'); // naive channel name check
    }).each(function() {
        this.nodeValue = this.nodeValue.replace(/@[a-zA-Z0-9_]+/g, '');
    });
    // Remove external trackers
    $('script[src]').each((i, el) => {
        let src = $(el).attr('src');
        if (src && src.startsWith('http') && !src.includes('vortex')) {
            $(el).remove();
        }
    });

    const cleanContent = $.html();
    const cleanFilePath = path.join(stagingDir, fileName);
    fs.writeFileSync(cleanFilePath, cleanContent);

    // Verify
    const $clean = cheerio.load(cleanContent, { decodeEntities: false });
    const getCleanQuestionCount = () => {
        let qContainers = $clean('.question, .tf-question, .matching-form-row').length;
        if (qContainers > 0) return qContainers;
        return $clean('input[type="text"], input[type="radio"], select').length;
    };
    const getCleanPassageCount = () => {
        let count = $clean('.reading-passage').length;
        if (count === 0) count = $clean('h2:contains("Reading Passage")').length;
        if (count === 0) count = 1;
        return count;
    };

    const cleanPassageCount = getCleanPassageCount();
    const cleanQuestionCount = getCleanQuestionCount();

    if (origQuestionCount !== cleanQuestionCount) {
        reportData.countChanged.push(fileName);
    }
    if (!origHasKey) {
        reportData.brokenKeys.push(fileName);
    }

    reportData.stagedCopies++;

    inventory.push({
        fileName,
        extension: path.extname(fileName),
        proposedTitle: fileName.replace(/\.[^/.]+$/, "").replace(/\([0-9]+\)/g, "").trim(),
        type: origPassageCount > 1 ? "Full Test" : "Focused Practice",
        passages: origPassageCount,
        questions: origQuestionCount,
        hasKey: origHasKey,
        hasSubmit: origHasSubmit,
        thirdPartyBranding,
        telegramLinks: origTelegramLinks.join(", ") || "None",
        externalScripts: origThirdParty.join(", ") || "None",
        status: "ready", // simplistic check
        access: "Premium", // default
        cleanupReq: origTelegramLinks.length > 0 ? "Remove Telegram links" : "None"
    });
}

for (let file of files) {
    const filePath = path.join(sourceDir, file);
    const ext = path.extname(file).toLowerCase();
    
    if (ext === '.html' || ext === '.htm') {
        processHtmlFile(file, filePath);
    } else {
        reportData.skipped++;
        reportData.manualReview.push(file);
        inventory.push({
            fileName: file,
            extension: ext,
            proposedTitle: file,
            type: "Unknown",
            passages: "N/A",
            questions: "N/A",
            hasKey: "Unknown",
            hasSubmit: "No",
            thirdPartyBranding: "Unknown",
            telegramLinks: "Unknown",
            externalScripts: "Unknown",
            status: "needs cleanup (manual conversion)",
            access: "Free",
            cleanupReq: "Convert from PDF/DOCX to HTML"
        });
    }
}

// Generate GEMINI_CONTENT_INVENTORY.md
let inventoryMd = `# Content Inventory: IELTS Reading Materials\n\n`;
inventoryMd += `| File Name | Extension | Proposed Title | Type | Passages | Questions | Answer Key | Submit Logic | Telegram Links | Status | Access |\n`;
inventoryMd += `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
for (let item of inventory) {
    inventoryMd += `| ${item.fileName} | ${item.extension} | ${item.proposedTitle} | ${item.type} | ${item.passages} | ${item.questions} | ${item.hasKey ? 'Yes' : 'No'} | ${item.hasSubmit ? 'Yes' : 'No'} | ${item.telegramLinks !== "None" ? 'Yes' : 'No'} | ${item.status} | ${item.access} |\n`;
}
fs.writeFileSync(path.join(projectRoot, 'GEMINI_CONTENT_INVENTORY.md'), inventoryMd);

// Generate GEMINI_CLEANUP_REPORT.md
let reportMd = `# Cleanup & Staging Report\n\n`;
reportMd += `- **Original HTML/HTM files processed**: ${reportData.totalHtml}\n`;
reportMd += `- **Staged clean copies created**: ${reportData.stagedCopies}\n`;
reportMd += `- **Files skipped (PDF/DOCX)**: ${reportData.skipped}\n`;
reportMd += `- **Files with broken/missing answer keys**: ${reportData.brokenKeys.length}\n`;
reportData.brokenKeys.forEach(f => reportMd += `  - ${f}\n`);
reportMd += `- **Files where question counts changed unexpectedly**: ${reportData.countChanged.length}\n`;
reportData.countChanged.forEach(f => reportMd += `  - ${f}\n`);
reportMd += `- **All third-party domains found**: ${Array.from(reportData.thirdPartyDomains).join(", ")}\n`;
reportMd += `- **Remaining manual-review issues (PDF/DOCX)**: ${reportData.manualReview.length}\n`;
reportData.manualReview.forEach(f => reportMd += `  - ${f}\n`);
reportMd += `- **Exact verification commands used**: Node.js script using Cheerio DOM parsing to count questions and passages before and after DOM manipulation.\n\n`;
reportMd += `### Verdict\n`;
if (reportData.countChanged.length === 0) {
    reportMd += `**Safe to review**\n`;
} else {
    reportMd += `**Not safe to merge (Question counts changed)**\n`;
}
fs.writeFileSync(path.join(projectRoot, 'GEMINI_CLEANUP_REPORT.md'), reportMd);

console.log("Cleanup script completed successfully.");
