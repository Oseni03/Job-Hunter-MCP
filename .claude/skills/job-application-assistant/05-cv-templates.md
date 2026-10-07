# Fixed HTML CV Template

All CVs use the internal `modern-fixed-v1` HTML template and Puppeteer.

**Output files:** `cv/main_<company>_<role>.html` and `cv/main_<company>_<role>.pdf`

The server escapes all profile and posting-derived values, renders an A4 PDF with Puppeteer, and reports the actual page count. The target is exactly two pages; overflows are warnings that require content cuts, never automatic unreadable scaling.

Section headings follow the requested CV language. Experience entries avoid page breaks where possible, and the host owns writing the returned HTML and PDF.
