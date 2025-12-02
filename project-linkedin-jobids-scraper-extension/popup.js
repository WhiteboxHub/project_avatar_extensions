

document.getElementById("fetchJobs").addEventListener("click", async () => {
    const keyword = document.getElementById("keyword").value.trim();
    const location = document.getElementById("location").value.trim() || "India";
    const status = document.getElementById("status");
  
    if (!keyword) {
      status.innerText = " Please enter a job keyword.";
      return;
    }
  
    status.innerText = "Opening LinkedIn Easy Apply search...";
  
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
    // Step 1 — navigate to LinkedIn Jobs with Easy Apply + posted today
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      world: "MAIN",
      func: (kw, loc) => {
        if (window.top === window.self) {
          const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
            kw
          )}&location=${encodeURIComponent(loc)}&f_AL=true&f_TPR=r86400`;
          window.location.href = url;
        }
      },
      args: [keyword, location],
    });
  
    // Step 2 — after page loads, start scraping
    status.innerText = "Waiting for LinkedIn to load...";
    setTimeout(async () => {
      status.innerText = "Fetching Easy Apply jobs...";
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: false },
        world: "MAIN",
        func: scrapeEasyApplyWithDetails,
        args: [keyword, location],
      });
    }, 8000);
  });
  
  // --- This runs inside LinkedIn page ---
  async function scrapeEasyApplyWithDetails(keyword, location) {
    console.log(`[LinkedIn Job Extractor] Starting for: ${keyword} in ${location}`);
  
    const jobs = [];
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  
    // Function to collect jobs from visible list
    async function collectJobsOnPage() {
      const cards = document.querySelectorAll("[data-job-id]");
      for (const el of cards) {
        try {
          const text = el.innerText.toLowerCase();
          if (!text.includes("easy apply")) continue;
  
          const jobId = el.getAttribute("data-job-id");
          let title =
            el.querySelector(".job-card-list__title")?.innerText?.trim() ||
            el.querySelector(".artdeco-entity-lockup__title a")?.innerText?.trim() ||
            "";
          // Remove duplicate/chained title (e.g., "A\nA with verification" ==> "A")
          if (title.includes("\n")) {
            // Take the part before the first newline
            title = title.split("\n")[0].trim();
          }
          const company =
            el.querySelector(".artdeco-entity-lockup__subtitle")?.innerText?.trim() || "";
          const loc =
            el.querySelector(".job-card-container__metadata-wrapper li")?.innerText?.trim() || "";
  
          if (jobId && !jobs.some((j) => j.jobId === jobId)) {
            jobs.push({ jobId, title, company, location: loc });
            console.log(`[+] ${title} @ ${company} (${loc})`);
          }
        } catch (err) {
          console.error("[LinkedIn Job Extractor] Error parsing job card:", err);
        }
      }
    }
  
    // Function to handle scrolling/pagination
    async function scrapeAllPages() {
      let page = 1;
      while (true) {
        console.log(`\n[LinkedIn Job Extractor] --- Page ${page} ---`);
        await collectJobsOnPage();
  
        const nextBtn = document.querySelector(
          `button[aria-label="Page ${page + 1}"], li[data-test-pagination-page-btn] button[aria-current="false"]`
        );
  
        if (nextBtn) {
          nextBtn.scrollIntoView({ behavior: "smooth", block: "center" });
          console.log(`[LinkedIn Job Extractor] Moving to page ${page + 1}...`);
          nextBtn.click();
          page++;
          await delay(6000);
        } else {
          console.log("[LinkedIn Job Extractor]  No more pages left.");
          break;
        }
      }
    }
  
    await scrapeAllPages();
  
    console.log(`[LinkedIn Job Extractor]  Total Easy Apply jobs: ${jobs.length}`);
  
    // Download JSON
    const fileName = `${keyword.replace(/\s+/g, "_")}_${location.replace(
      /\s+/g,
      "_"
    )}_easyapply_today.json`;
  
    const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  
    alert(` Downloaded ${jobs.length} Easy Apply jobs for "${keyword}" in ${location}`);
  }