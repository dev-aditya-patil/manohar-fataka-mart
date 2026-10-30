# Manohar Enterprises · Product & Price Finder

A fast, mobile-first price lookup for the shop counter.
Open the site, type a product, brand or category, and read the price.

**Manohar Enterprises**, Cotton Market, Near Court, Malkapur · 9823121511 / 9767129653 · manoharenterprises17@gmail.com

## Files

| File | Purpose |
|---|---|
| `index.html` | The page |
| `styles.css` | Design (mobile first, light and dark mode) |
| `app.js` | Search, category filters, sorting, rendering (plain JavaScript, no libraries) |
| `products.json` | The product catalogue, converted from `Product_list_2k26.xlsx` |
| `manifest.json`, `service-worker.js`, `assets/` | "Add to Home screen" app icon and offline use |
| `update.html` | Owner tool that turns a revised Excel file into a new `products.json` |

There is no database, server, build step or paid service. Everything runs in the browser.

## Put it online with GitHub Pages (no terminal needed)

1. Sign in at <https://github.com> (create a free account if needed).
2. Click **+** (top right) → **New repository**. Name it e.g. `manohar-enterprises`, choose **Public**, click **Create repository**.
3. On the new repository page click **uploading an existing file**.
4. Drag in **everything inside** the `manohar-enterprises` folder: `index.html`, `styles.css`, `app.js`, `products.json`, `manifest.json`, `service-worker.js`, `update.html`, `README.md` **and the `assets` folder**. (Drag the files themselves, not the outer folder, so `index.html` sits at the top level.)
5. Click **Commit changes**.
6. Go to **Settings → Pages**. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, then **Save**.
7. After 1–2 minutes the site is live at
   `https://<your-github-username>.github.io/manohar-enterprises/`

All paths in the project are relative, so it works from that sub-folder address.

**On the shop phone:** open the link in Chrome → ⋮ menu → **Add to Home screen**. It then opens like an app and keeps working without internet, using the last price list it downloaded.

## Updating prices from a revised Excel file

1. Edit `Product_list_2k26.xlsx` as usual. Keep the same column headings: *Sr No., Category, Product Name, Brand, Box Pack/ Qty, Function, Rate (₹)*. Section heading rows such as "FLOWER POTS" are fine.
2. Open `https://<your-github-username>.github.io/manohar-enterprises/update.html`.
3. Choose the Excel file. It is read inside your browser and is not uploaded anywhere. Check the summary: product count, rows without a rate, skipped rows and possible duplicates.
4. Tap **Download products.json**.
5. In the GitHub repository click **Add file → Upload files**, drop in the new `products.json` (it replaces the old one), and click **Commit changes**.
6. Within a few minutes the website shows the new prices. Phones pick them up the next time they open the site while online.

## How the Excel data was converted

Source: `Product_list_2k26.xlsx` (version of 30 Oct 2026), sheet **"2026 Price"**, heading row 7.

* **237 products**: Sr. No. 1–232 plus **6 new products that have no Sr. No.** in Excel (COCK 10 CM PLAIN / RED / GREEN sparkles, COCK TRI COLOR FOUNTAIN, IN 4" DHAMAKA, COCK LUNIK ROCKET). These appear in their Excel position and are shown without a "#" number.
* **Sr. No. 166 is excluded** because that row has only the number and no other data.
* Section heading rows (e.g. "SKY SHOTS MEGA") are not products. They are stored with each product as `section`, so searching "sky shots" works.
* Product names, brands, packs and functions are kept exactly as typed in Excel, including spellings such as "SARPENT" and "OCTPUSY". Only extra spaces were tidied (e.g. `7 CM   PLAIN` → `7 CM PLAIN`).
* Rates are copied exactly. Cells typed as text, such as `₹ 60`, are stored as the number 60. **Sr. 132 (POP POP, MICKY M)** has the rate `₹ 400 Box`, which is stored as 400 and shown as "₹400 per box".
* **11 products have no rate** in the Excel file (Sr. 3, 29, 39, 44, 63, 65, 128, 152, 190, 210 and the new COCK 10 CM GREEN). The site shows these as "Rate not listed" and never guesses a price.
* Possible duplicates were **kept, not deleted**:
  * Sr. 231 and 232 are identical (10000 WALA, FATHER, ₹2,100).
  * Sr. 60 (₹80) and 64 (₹140) are both "GC SPL, VADIVEL, 1 Pack (10pc)" but have different prices.
* The sheet's footnote, "*NOTE - there can be misprint in the above Price List.", is shown at the bottom of the site.

## Search tips

* Search looks at product name, brand, category, function, pack size and section, in any order: `cock rocket`, `fp big`, `120 shot`.
* Partial words work (`whist`), and so do small typos (`rocet`, `fountian`).
* `4"`, `4''` and `4 inch` all find the same 4-inch items. `colour` and `color` are treated the same.
* A Sr. No. (e.g. `132`) finds that product when nothing else matches.
* Press **Enter** to hide the phone keyboard. On a computer, press **/** to jump to the search box and **Esc** to clear it.
* The address bar keeps your search (e.g. `…/?q=supreme&cat=ROLL+%26+SERPENT`), so a reload or a shared link shows the same results.
