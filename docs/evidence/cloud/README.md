# Cloud account mobile evidence

[Account controls at 375 × 400 CSS pixels](account-375-keyboard-sized.png) were captured in Playwright Chromium iPhone-sized emulation at 3× device scale, after scrolling the form body. The separate footer remains reachable. This is **not a real Safari keyboard or Home Screen installation**. Geometry tests also check 320/375/390 widths for horizontal overflow and reachable controls. No real customer content, passwords or tokens appear; the cloud test sessions and content are synthetic.

The browser tests use real disposable PostgreSQL transaction/RLS functions behind intercepted Auth/Storage HTTP. Actual hosted JWT validation, Storage delivery and real-device behavior remain owner checks in [the cloud guide](../../../supabase/CLOUD.md).
