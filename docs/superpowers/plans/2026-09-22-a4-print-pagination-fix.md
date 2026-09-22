# A4 Print/PDF Formatting, Pagination & Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Report print/PDF generation so that page 1 contains a complete Executive Cover with an All-Link Overview Table and pages 2+ contain exactly one interface card per page without awkward page-break fracturing, with orientation and theme toggles.

**Architecture:** Update `Header.tsx` to strictly hide during print (`no-print print:hidden`). Refactor `ReportView.tsx` with dynamic `@page` sizing (A4 portrait default, landscape toggle), theme toggles (Dark Obsidian / Light Ink-friendly White), an executive cover page (`.report-cover-page` with forced page break after) including an All-Link Summary Table, and tightened per-interface cards (`.report-card` with `break-inside: avoid` and `break-after: page`) containing a 220px timeline chart and compact Top 10 Talker ASN table.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Apache ECharts (`echarts-for-react`), Vite.

**Spec:** `print_a4_fix_prompt.txt`

## Global Constraints

- Paper sizing: default standard A4 Portrait (`@page { size: A4 portrait; margin: 8mm; }`), switchable to Landscape (`@page { size: A4 landscape; margin: 8mm; }`).
- Header navigation bar must NEVER appear in print output.
- Page 1 must be a self-contained Executive Cover Page (`.report-cover-page`) with `break-after: page !important; page-break-after: always !important;`.
- Pages 2+ must have exactly one interface card per page (`.report-card`), with `break-inside: avoid !important; break-after: page !important;` (last card has `break-after: auto !important;`).
- Timeline chart height must be 210px–230px (220px) to comfortably fit on a single page alongside top ASNs and KPIs.
- Must support both Dark (Obsidian) and Light (Ink-friendly White) print themes.
- Build must pass cleanly with `npm run build` (`tsc -b && vite build`) with zero TypeScript or bundling errors.

## Review Focus

1. **Cover page table formatting on narrow viewports/print**: The All-Link Overview Table must have clean horizontal alignment and wrapping prevention for bps values and badges.
2. **Page break behavior on the last interface card**: `.report-card:last-child` must not trigger an unnecessary blank trailing page.
3. **ECharts theme synchronization**: Chart axis labels, grid lines, and legends must adjust contrast properly between Light and Dark print modes.
4. **Full-bleed margin reset in print media**: Outer wrappers (`html`, `body`, `main`, `#root`, `.report-canvas`) must remove padding/margins in `@media print` so the browser's 8mm `@page` margin defines page bounds without double margins.
5. **No empty state or null pointer errors**: Top ASN talker in the cover table must handle interfaces with 0 ASNs gracefully without crashing.

---

### Task 1: Ensure Print Exclusion in Navigation Header & Global CSS

**Files:**
- Modify: `frontend/src/index.css:55-72`
- Modify: `frontend/src/components/Header.tsx:32-34`

**Interfaces:**
- Consumes: Tailwind CSS print utilities
- Produces: Global `.no-print` and `print:hidden` styles preventing interactive UI from leaking into print media.

- [ ] **Step 1: Add global print media utility in `index.css`**

Add the `@media print` definition in `frontend/src/index.css`:
```css
@media print {
  .no-print {
    display: none !important;
  }
}
```

- [ ] **Step 2: Add `print:hidden` and maintain `no-print` on `<header>` in `Header.tsx`**

Ensure `Header.tsx` `<header>` element has both `no-print` and `print:hidden`:
```tsx
className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 no-print print:hidden"
```

- [ ] **Step 3: Run build to verify type check and compilation**

Run: `npm run build` in `frontend/`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/index.css frontend/src/components/Header.tsx
git commit -m "fix(header): ensure navigation header is completely hidden during print"
```

---

### Task 2: Implement Orientation & Theme Controls, Chart Theming, and Cover Table

**Files:**
- Modify: `frontend/src/components/ReportView.tsx`

**Interfaces:**
- Consumes: `InterfaceReportResponse`, `InterfaceReportItem`, `formatMetric`
- Produces: Interactive controls for orientation (`portrait` | `landscape`) and print theme (`dark` | `light`), All-Link Executive Summary Table, themed `InterfaceTimelineChart`.

- [ ] **Step 1: Add theme support to `InterfaceTimelineChart`**

Add `theme?: 'dark' | 'light'` prop to `InterfaceTimelineChart`.
When `theme === 'light'`:
- Legend text color: `#334155`
- Axis lines: `#CBD5E1`
- Axis labels: `#475569`
- Split lines: `rgba(203, 213, 225, 0.6)`
- Y-axis name color: `#D97706`
- Area fill colors adjust slightly for clean contrast on white background.
When `theme === 'dark'`:
- Retain existing dark styling (`#94A3B8`, `#242E42`, `#64748B`, `#FFCE00`).
Set container height to `h-[220px]` (within the 210px–230px requirement).

- [ ] **Step 2: Add Orientation and Theme state & toggles in `ReportView.tsx`**

State:
```tsx
const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')
const [printTheme, setPrintTheme] = useState<'dark' | 'light'>('dark')
```
In top control bar (`.no-print`):
- Segmented button for Orientation: `Portrait` (default) vs `Landscape`.
- Segmented button for Theme: `Dark (Obsidian)` (default) vs `Light (Ink-friendly)`.

- [ ] **Step 3: Build the Page 1 All-Link Executive Summary Table**

Inside `.report-cover-page`, underneath the 4 Global KPI blocks, render an All-Link Executive Summary Table:
- Headers: Interface, Type, Peak Inbound, Peak Outbound, Avg Inbound, Avg Outbound, Top Source ASN (#1 Talker).
- For each item in `reportData.reports`:
  - Interface Name & Type badge (Transit / IX)
  - Formatted Peak Inbound with directional icon
  - Formatted Peak Outbound with directional icon
  - Formatted Avg Inbound
  - Formatted Avg Outbound
  - Top Source ASN (`report.top_asns[0]` showing `AS{asn} {org}` and rate/percent, or `—` if empty).

- [ ] **Step 4: Update Per-Interface Card Layout & Sizing**

For each `.report-card`:
- Chart container height set to 220px.
- ASN table: compact rows with `py-1 px-2`, truncated org name with tooltip, progress bar.
- Layout remains side-by-side on wide screens (`grid-cols-1 lg:grid-cols-12` or `print:grid-cols-12`), ensuring both chart and top ASNs fit comfortably within the printable page height.

- [ ] **Step 5: Run build to verify type check and compilation**

Run: `npm run build` in `frontend/`
Expected: PASS with 0 errors.

---

### Task 3: Implement Dynamic Print CSS & Stylesheet Rules

**Files:**
- Modify: `frontend/src/components/ReportView.tsx`

**Interfaces:**
- Consumes: `orientation`, `printTheme`
- Produces: Clean, standard-compliant print output via dynamic `<style>` tag.

- [ ] **Step 1: Write dynamic `<style>` block in `ReportView.tsx`**

Embed dynamic `@media print` CSS:
```css
@media print {
  @page {
    size: A4 ${orientation};
    margin: 8mm;
  }
  html, body, #root, main {
    background: ${printTheme === 'light' ? '#FFFFFF' : '#0B0F17'} !important;
    color: ${printTheme === 'light' ? '#0F172A' : '#F1F5F9'} !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .no-print {
    display: none !important;
  }
  .report-canvas {
    padding: 0 !important;
    margin: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
  }
  .report-cover-page {
    page-break-after: always !important;
    break-after: page !important;
    margin-bottom: 0 !important;
    box-shadow: none !important;
    ${printTheme === 'light' ? `
      background-color: #FFFFFF !important;
      border: 1px solid #CBD5E1 !important;
      color: #0F172A !important;
    ` : `
      background-color: #161E2E !important;
      border: 1px solid #242E42 !important;
    `}
  }
  .report-card {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    page-break-after: always !important;
    break-after: page !important;
    margin-bottom: 0 !important;
    box-shadow: none !important;
    ${printTheme === 'light' ? `
      background-color: #FFFFFF !important;
      border: 1px solid #CBD5E1 !important;
      color: #0F172A !important;
    ` : `
      background-color: #161E2E !important;
      border: 1px solid #242E42 !important;
    `}
  }
  .report-card:last-child {
    page-break-after: auto !important;
    break-after: auto !important;
  }
  /* Theme-specific styles for sub-boxes, tables, and borders */
  ${printTheme === 'light' ? `
    .metric-box, .chart-panel, .asn-panel, .cover-table-container {
      background-color: #F8FAFC !important;
      border-color: #E2E8F0 !important;
    }
    .metric-box span, .text-slate-400, .text-slate-500 {
      color: #475569 !important;
    }
    .text-white, .text-slate-100, .text-slate-200 {
      color: #0F172A !important;
    }
    table, tr, td, th {
      border-color: #E2E8F0 !important;
    }
  ` : ''}
}
```

- [ ] **Step 2: Add print class helpers to the JSX elements**

Apply `.chart-panel`, `.asn-panel`, `.cover-table-container` classes to ensure the print styles match cleanly whether dark or light mode is selected.

- [ ] **Step 3: Run build to verify type check and compilation**

Run: `npm run build` in `frontend/`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/components/ReportView.tsx
git commit -m "feat(reports): implement A4 portrait/landscape and light/dark print formatting"
```

---

### Task 4: Verification and Smoke Testing

**Files:**
- Verify: `frontend/src/components/ReportView.tsx`
- Verify: `frontend/src/components/Header.tsx`
- Verify: `frontend/src/index.css`

- [ ] **Step 1: Run complete build**

Run: `npm run build` in `frontend/`
Expected: `tsc -b && vite build` succeeds with 0 errors.

- [ ] **Step 2: Run linter if configured**

Run: `npm run lint` in `frontend/`
Expected: 0 warnings or errors.

- [ ] **Step 3: Verify pagination logic against specifications**

Verify that:
1. Cover page has `.report-cover-page` and CSS enforces `page-break-after: always !important; break-after: page !important;`.
2. Cards have `.report-card` and CSS enforces `break-inside: avoid !important; break-after: page !important;`.
3. Last card has `.report-card:last-child` with `break-after: auto !important;`.
4. Orientation toggle changes `@page { size: A4 portrait; }` vs `landscape`.
5. Theme toggle adjusts colors for Ink-friendly light vs dark obsidian.
6. Navbar `<header>` contains `no-print print:hidden`.
