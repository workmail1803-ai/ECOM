"""
Generate the Nazmul Commerce manual QA test plan as a PDF.

Landscape A4 so the test matrix has room for steps and expected results side by
side. Uses only WinAnsi-safe characters — the Taka sign is written "Tk" because
the built-in Helvetica face has no glyph for it and would render a black box.
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

PAGE = landscape(A4)
MARGIN = 14 * mm

BRAND = colors.HexColor("#1B4DFF")
INK = colors.HexColor("#14161A")
INK_SOFT = colors.HexColor("#3D434D")
INK_MUTED = colors.HexColor("#6B7280")
LINE = colors.HexColor("#E6E5E1")
SUNKEN = colors.HexColor("#F7F7F5")
OK = colors.HexColor("#0F766E")
WARN = colors.HexColor("#B45309")
DANGER = colors.HexColor("#BE123C")

styles = getSampleStyleSheet()


def S(name, **kw):
    base = dict(fontName="Helvetica", fontSize=8.2, leading=10.6, textColor=INK_SOFT)
    base.update(kw)
    return ParagraphStyle(name, **base)


CELL = S("cell")
CELL_B = S("cellb", fontName="Helvetica-Bold", textColor=INK)
CELL_ID = S("cellid", fontName="Helvetica-Bold", fontSize=8, textColor=BRAND)
CELL_SM = S("cellsm", fontSize=7.4, leading=9.4, textColor=INK_MUTED)

H1 = S("h1", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=INK)
H2 = S("h2", fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=INK)
H3 = S("h3", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=BRAND)
BODY = S("body", fontSize=9, leading=13.5)
SMALL = S("small", fontSize=8, leading=11.5, textColor=INK_MUTED)

COVER_TITLE = S("ct", fontName="Helvetica-Bold", fontSize=34, leading=39, textColor=INK)
COVER_SUB = S("cs", fontSize=13, leading=19, textColor=INK_MUTED)

# ---------------------------------------------------------------- test data --
# (id, area, steps, expected)

SECTIONS = [
    (
        "1. Homepage",
        "The homepage is the most-visited route and is cached for 5 minutes "
        "(revalidate = 300). If a change you made in admin is not visible, wait "
        "5 minutes or hard-reload before raising a bug.",
        [
            ("1.1", "Hero carousel loads",
             "Open the site root.",
             "A full-width hero shows an eyebrow label, headline, subtitle and at least one button. The first slide's image is sharp, not stretched."),
            ("1.2", "Hero auto-advances",
             "Stay on the homepage without moving the mouse for ~7 seconds.",
             "The slide changes on its own roughly every 6 seconds and the active dot moves with it."),
            ("1.3", "Hero pauses on hover",
             "Hover the pointer over the hero and wait 10 seconds.",
             "The slide does NOT change while the pointer is over it, and resumes when you move away."),
            ("1.4", "Hero manual controls",
             "Click the left and right arrows (bottom-right), then click each dot.",
             "The slide changes immediately in the expected direction. The dot for the visible slide is wider/filled. No control ever overlaps the headline text."),
            ("1.5", "Hero buttons navigate",
             "Click the primary button on each slide.",
             "You land on the linked category listing and the results match the slide's promise (e.g. 'Shop earbuds' -> Earbuds & Headphones)."),
            ("1.6", "Promo strip",
             "Look directly beneath the hero.",
             "A dark strip shows the free-delivery message with a working 'See delivery charges' link."),
            ("1.7", "Shop by category",
             "Scroll to 'Shop by category'. Count the tiles and click three of them.",
             "All 9 categories appear (Earbuds & Headphones, Power Bank, Mini UPS, Projector, Lighting, Mobile Accessories, Gaming Accessories, Smart Gadgets, Chargers & Cables). Each opens its filtered listing."),
            ("1.8", "Flash sale countdown",
             "Find the 'Weekend flash sale' block and watch the timer for 3 seconds.",
             "Hours/minutes/seconds tick down live. Sale prices are lower than the struck-through price and are whole Taka (no stray decimals)."),
            ("1.9", "Flash sale stock bar",
             "Look at the bar under each flash-sale product.",
             "A red progress bar and an 'N sold of M' caption. Clicking the card opens that product."),
            ("1.10", "Flash sale expiry",
             "In admin, set the flash sale's end time to the past, then reload the homepage.",
             "The entire flash-sale block disappears. Sale prices no longer apply in the cart either."),
            ("1.11", "Best sellers rail",
             "Scroll to 'Best sellers' and swipe/scroll the row horizontally.",
             "The row scrolls smoothly with no visible scrollbar and snaps to cards. 'See all' opens /products?sort=popular."),
            ("1.12", "Featured grid",
             "Scroll to 'Handpicked for you'.",
             "A grid of products, each showing image, name, rating, price and an Add to cart button."),
            ("1.13", "Offer cards",
             "Scroll to the three-up offer cards.",
             "Each card has a coloured left border, an eyebrow, a heading and a working link."),
            ("1.14", "New arrivals rail",
             "Scroll to 'New arrivals'.",
             "A horizontal rail of the most recently published products."),
            ("1.15", "Customer reviews wall",
             "Scroll to 'What customers say'.",
             "Only appears once at least one 4+ star review is APPROVED in admin. Shows rating, quote, an abbreviated name (e.g. 'Nazmul H.') and the product."),
            ("1.16", "Why choose us",
             "Scroll to 'Buying from Nazmul'.",
             "Four value cards: nationwide delivery, official warranty, genuine stock, real humans."),
            ("1.17", "Delivery / warranty / contact",
             "Scroll to the three cards above the footer.",
             "Delivery timings, the warranty note from settings, and support hours + phone. Each 'Read more' link works."),
            ("1.18", "Empty catalogue fallback",
             "(Optional) Unpublish every product in admin, then reload.",
             "A tidy 'The catalogue is still being loaded' panel appears instead of empty sections. No broken layout."),
        ],
    ),
    (
        "2. Header, navigation and support",
        "The header is sticky. On mobile the category nav collapses into a drawer.",
        [
            ("2.1", "Logo returns home",
             "Click the Nazmul logo from any page.",
             "You land on the homepage."),
            ("2.2", "Utility strip (desktop)",
             "Look at the thin dark bar at the very top on a desktop width.",
             "Store tagline on the left; phone number, Track order and Delivery links on the right. The phone number is click-to-call."),
            ("2.3", "Search submits",
             "Type 'projector' in the search box and press Enter.",
             "You land on /products?q=projector and only matching products are listed."),
            ("2.4", "Search finds by brand and SKU",
             "Search 'Anker', then search a SKU such as 'AK-N65'.",
             "Both return sensible results - the search index is weighted name > brand/category > SKU > description."),
            ("2.5", "Search with no results",
             "Search for 'qqqzzz'.",
             "A friendly empty state with a 'Clear all filters' button, not a blank page or an error."),
            ("2.6", "Category nav (desktop)",
             "Look at the nav row under the search bar.",
             "'All products' plus all 9 categories. The row scrolls horizontally if the window is narrow. No category is missing."),
            ("2.7", "Cart badge",
             "Add an item to the cart and look at the cart icon.",
             "A blue badge shows the number of units (not lines). It updates without a manual refresh."),
            ("2.8", "Account icon (signed out)",
             "Click the person icon while signed out.",
             "You land on /sign-in."),
            ("2.9", "Account icon (signed in)",
             "Sign in, then click the person icon.",
             "You land on /account and your first name appears next to the icon on wide screens."),
            ("2.10", "Admin link visibility",
             "Compare the nav as a customer and as an admin.",
             "The black 'Admin' button appears ONLY for admin/manager accounts. A customer never sees it."),
            ("2.11", "Mobile drawer opens full height",
             "On a phone (or a 375px-wide window), tap the hamburger.",
             "The drawer covers the FULL screen height - not just the header area. 'All products' plus all 9 categories are listed, with Track order / My orders / Delivery charges / Returns pinned at the bottom."),
            ("2.12", "Mobile drawer closes",
             "With the drawer open, tap the X, then reopen and tap the dark area outside it, then reopen and press Escape.",
             "All three close the drawer. The page behind does not scroll while the drawer is open."),
            ("2.13", "Support widget",
             "Click the round blue chat button, bottom-right.",
             "A panel lists only the channels that are configured (WhatsApp, Messenger, Phone, Email). Every entry opens the correct app. No dead buttons."),
            ("2.14", "Footer links",
             "Click every link in the footer.",
             "All resolve - shop categories, Track order, About, Contact, FAQ, Shipping, Returns, Warranty, Privacy, Terms. None 404."),
            ("2.15", "Footer delivery table",
             "Look at the 'Delivery charges' strip in the footer.",
             "Four zones with fee, day range and free-delivery threshold. These MUST match /admin/settings - they are read from the database, not hardcoded."),
            ("2.16", "Newsletter signup",
             "Enter an email in the footer and submit. Then submit the SAME email again.",
             "First submit shows 'You are on the list.' The duplicate also succeeds quietly (no scary error) because a repeat signup is not a failure."),
            ("2.17", "Newsletter rejects bad input",
             "Enter 'notanemail' and submit.",
             "An inline validation error. Nothing is written."),
        ],
    ),
    (
        "3. Product listing, search and filters",
        "Filters live in the URL, so every filtered view is shareable and "
        "bookmarkable. Changing any filter resets you to page 1.",
        [
            ("3.1", "Listing loads",
             "Open /products.",
             "A product count ('25 products'), a sort dropdown, a filter sidebar (desktop) and a product grid."),
            ("3.2", "Category filter",
             "Click a category in the sidebar.",
             "Only that category's products remain, the URL gains ?category=..., the heading changes to the category name, and the count updates."),
            ("3.3", "Brand filter",
             "Pick a brand in the sidebar.",
             "Only that brand's products remain."),
            ("3.4", "Price range",
             "Enter Min 1000 and Max 5000, click Go.",
             "Only products priced between Tk 1,000 and Tk 5,000 are shown. Prices in the URL are in Taka, not paisa."),
            ("3.5", "Rating filter",
             "Click '4 & up'.",
             "Only products whose average rating is 4 or higher remain. (Needs approved reviews to show any effect.)"),
            ("3.6", "In-stock filter",
             "Click 'In stock only'.",
             "Products with zero stock disappear."),
            ("3.7", "Filters combine",
             "Apply a category AND a price range AND in-stock together.",
             "All three narrow the results at once, and all three appear in the URL."),
            ("3.8", "Active filter count",
             "Apply two filters, then look at the mobile 'Filters' button.",
             "A blue badge shows the number of active filters."),
            ("3.9", "Clear all filters",
             "With filters applied, click 'Clear all filters'.",
             "Every filter resets and the full catalogue returns."),
            ("3.10", "Unknown category slug",
             "Manually visit /products?category=does-not-exist.",
             "Zero results and the empty state - NOT the full catalogue. (A bad slug must never silently show everything.)"),
            ("3.11", "Sort - newest",
             "Choose 'Newest first'.",
             "Most recently published products first."),
            ("3.12", "Sort - price low to high",
             "Choose 'Price: low to high'.",
             "Prices ascend down the grid. Then choose high to low and confirm it reverses."),
            ("3.13", "Sort - popular / top rated",
             "Choose 'Most popular', then 'Top rated'.",
             "Ordering changes sensibly (by units sold, then by review weight)."),
            ("3.14", "Sort survives filtering",
             "Set a sort, then change a category.",
             "The sort is preserved in the URL and still applied."),
            ("3.15", "Pagination",
             "If more than 24 products match, scroll to the bottom.",
             "Numbered pages with prev/next. Clicking a page scrolls back to the top and keeps all filters."),
            ("3.16", "Mobile filter drawer",
             "On a phone, tap 'Filters'.",
             "A bottom sheet opens covering most of the screen, with a 'Show N results' button that closes it."),
            ("3.17", "Breadcrumb",
             "Open a category listing.",
             "Home / Products / <Category>, each segment clickable."),
            ("3.18", "Product card contents",
             "Look at any card.",
             "Image, discount badge if on sale, name (max 2 lines), rating, price, struck-through compare-at price, 'Only N left' when low, and Add to cart."),
            ("3.19", "Out-of-stock card",
             "Set a product's stock to 0 in admin, then find it in the listing.",
             "The image is dimmed with an 'Out of stock' pill and the button is disabled and reads 'Out of stock'."),
        ],
    ),
    (
        "4. Product detail page",
        "Every field on this page is admin-editable. Nothing is hardcoded.",
        [
            ("4.1", "Page loads",
             "Open any product from the listing.",
             "Breadcrumb, gallery, title, price and buy box all render."),
            ("4.2", "Gallery thumbnails",
             "Click each thumbnail under the main image.",
             "The main image swaps. The active thumbnail has a blue border."),
            ("4.3", "Product video",
             "Add a YouTube embed URL to a product in admin, then reopen the page.",
             "A play tile appears after the thumbnails; clicking it plays the video in place."),
            ("4.4", "Badges",
             "Open a product flagged New arrival and one flagged Best seller.",
             "The matching badge shows next to the brand name."),
            ("4.5", "Price and discount",
             "Open a product with a compare-at price.",
             "Large price, struck-through compare-at, and a 'Save N%' badge. The percentage is rounded DOWN (never overstated)."),
            ("4.6", "Stock messaging",
             "Compare a well-stocked product with one at or below its low-stock threshold.",
             "'In stock' in green vs 'Only N left' in amber. Zero stock shows 'Out of stock' in red and disables both buttons."),
            ("4.7", "Variant selection",
             "On a product with variants (e.g. Soundcore P40i), click each option.",
             "The selected option is highlighted; price and stock update to that variant. Quantity resets to 1."),
            ("4.8", "Sold-out variant",
             "Set one variant's stock to 0 in admin, reopen the page.",
             "That option is struck through and cannot be selected."),
            ("4.9", "Quantity clamping",
             "Press + repeatedly beyond the available stock.",
             "The counter stops at the available stock (or 99). The minus button stops at 1."),
            ("4.10", "Add to cart",
             "Click Add to cart.",
             "A success toast, the button briefly shows 'Added', and the header cart badge increments."),
            ("4.11", "Add beyond stock clamps",
             "Set stock to 2, then add 5 to the cart.",
             "The cart holds 2 and a warning toast explains only 2 were available. No error page."),
            ("4.12", "Buy now",
             "Click 'Buy now'.",
             "The item is added and you go straight to /checkout."),
            ("4.13", "Wishlist (signed out)",
             "While signed out, click 'Save for later'.",
             "An error toast asking you to sign in. Nothing is saved."),
            ("4.14", "Wishlist (signed in)",
             "Sign in, click 'Save for later', then click again.",
             "First click saves (heart fills, toast). Second click removes it. The item appears/disappears in /account/wishlist."),
            ("4.15", "Share",
             "Click Share.",
             "On mobile the native share sheet opens. On desktop the URL is copied and the button shows 'Copied'."),
            ("4.16", "Delivery / warranty / returns panel",
             "Look below the buttons.",
             "Delivery starting price and Dhaka timing, the product's warranty text, and the returns window from settings."),
            ("4.17", "Key features",
             "Scroll to 'Key features'.",
             "A ticked list matching what is set on the product in admin."),
            ("4.18", "Description",
             "Scroll to 'Description'.",
             "Paragraph breaks from admin are preserved."),
            ("4.19", "Specifications table",
             "Scroll to 'Full specifications'.",
             "A striped two-column table of label/value pairs."),
            ("4.20", "Ratings summary",
             "Scroll to 'Ratings & reviews'.",
             "Average out of 5, star row, total count, and a 5-to-1 star histogram."),
            ("4.21", "Review gating - not purchased",
             "As a signed-in customer who has NOT received this product, look for the review form.",
             "No form. Instead: 'You can write a review once this product has been delivered to you.'"),
            ("4.22", "Review gating - signed out",
             "Sign out and reload.",
             "A 'Sign in to review a product you have bought' message with a working link."),
            ("4.23", "Review submission",
             "As a customer with a DELIVERED order for this product, set a star rating, write 10+ characters and submit.",
             "'Thanks - your review is awaiting moderation.' It does NOT appear publicly until approved in admin."),
            ("4.24", "Duplicate review blocked",
             "Try to review the same product twice.",
             "'You have already reviewed this product.'"),
            ("4.25", "Related products",
             "Scroll to 'You might also like'.",
             "Products from the same category, excluding the one you are viewing."),
            ("4.26", "Invalid product URL",
             "Visit /products/this-does-not-exist.",
             "The custom 404 page with links home and to the catalogue."),
            ("4.27", "Draft product is hidden",
             "Set a product to Draft in admin, then open its public URL.",
             "404. A draft must never be publicly reachable."),
        ],
    ),
    (
        "5. Cart",
        "CRITICAL: every figure in the cart is calculated by the database "
        "function quote_cart(). The browser never adds anything up. If a total "
        "here disagrees with the checkout total, that is a serious bug.",
        [
            ("5.1", "Empty cart",
             "Open /cart with nothing in it.",
             "A friendly empty state with a 'Start shopping' button."),
            ("5.2", "Line item detail",
             "Add a product with a variant and open the cart.",
             "Image, product name, variant name, unit price, compare-at price, and the line total."),
            ("5.3", "Quantity increase",
             "Click + on a line.",
             "Quantity and line total update, and the subtotal and total recalculate."),
            ("5.4", "Quantity clamped to stock",
             "Try to raise quantity above available stock.",
             "The + button disables at the stock limit. If stock dropped since adding, a warning explains it."),
            ("5.5", "Remove a line",
             "Click Remove.",
             "The line disappears and the totals update. Removing the last line shows the empty state."),
            ("5.6", "Valid coupon",
             "With a cart over Tk 5,000, type BIDYUT10 and click Apply.",
             "A green chip shows the code, a Discount row appears (10%, capped at Tk 1,500), and the total drops by exactly that amount."),
            ("5.7", "Coupon below minimum",
             "With a cart UNDER Tk 5,000, apply BIDYUT10.",
             "Rejected with 'Your order is below this coupon's minimum spend.' No discount is applied."),
            ("5.8", "Invalid coupon",
             "Apply 'NOTAREALCODE'.",
             "'We could not find that coupon code.' The total is unchanged."),
            ("5.9", "Expired coupon",
             "In admin set a coupon's expiry to the past, then apply it.",
             "'That coupon has expired.'"),
            ("5.10", "Paused coupon",
             "Pause a coupon in admin, then apply it.",
             "'That coupon is no longer active.'"),
            ("5.11", "Per-customer limit",
             "Use WELCOME200 (limit 1 per user) on one order, then try it on a second order with the same account.",
             "'You have already used this coupon.'"),
            ("5.12", "Remove coupon",
             "With a coupon applied, click the X on the green chip.",
             "The discount is removed and the total returns to the undiscounted amount."),
            ("5.13", "Coupon survives navigation",
             "Apply a coupon, browse to another page, then return to the cart.",
             "The coupon is still applied - it is stored on the cart, not in the browser."),
            ("5.14", "Out-of-stock line blocks checkout",
             "Add a product, then set its stock to 0 in admin, then reload the cart.",
             "The line is flagged in red ('Out of stock'), a warning appears, and the 'Proceed to checkout' button is disabled."),
            ("5.15", "Partial stock",
             "Have 5 in the cart, then reduce stock to 2 in admin and reload.",
             "'Not enough stock left - only 2 available'. The line total reflects 2, not 5, so the displayed total is never a fantasy."),
            ("5.16", "Guest cart persists",
             "As a signed-out visitor, add items, close the tab, reopen the site.",
             "The cart still holds the items (it is keyed to a httpOnly cookie)."),
            ("5.17", "Guest cart merges on sign-in",
             "Add items while signed out, then sign in to an account that already has different items in its cart.",
             "Both sets are present after signing in. Quantities are summed and clamped to available stock."),
            ("5.18", "Cart clears after order",
             "Complete a checkout, then open /cart.",
             "The cart is empty and any coupon is cleared."),
        ],
    ),
    (
        "6. Checkout and payment",
        "SECURITY-CRITICAL section. The checkout form contains no price field of "
        "any kind. place_order() re-calculates every figure from live catalogue "
        "data and ignores anything the browser claims.",
        [
            ("6.1", "Empty cart redirect",
             "With an empty cart, visit /checkout directly.",
             "You are redirected to /cart."),
            ("6.2", "Blocked cart redirect",
             "Put an out-of-stock item in the cart, then visit /checkout.",
             "You are redirected back to /cart to fix it first."),
            ("6.3", "Required field validation",
             "Submit the form with everything blank.",
             "Inline errors on name, phone, district, area and house/road. Nothing is submitted."),
            ("6.4", "Name too short",
             "Enter a single character as the name and submit.",
             "'Please enter the recipient's full name'."),
            ("6.5", "Street too short",
             "Enter 'x' as house & road and submit.",
             "'Enter the house and road so the courier can find you'."),
            ("6.6", "Phone - local format",
             "Enter 01712345678.",
             "Accepted."),
            ("6.7", "Phone - +880 format",
             "Enter +8801712345678.",
             "Accepted and normalised to 01712345678 on the resulting order. (This previously failed - please test it carefully.)"),
            ("6.8", "Phone - other formats",
             "Try 8801712345678, then 1712345678, then 017-1234-5678.",
             "All are accepted and normalised to 01712345678."),
            ("6.9", "Phone - invalid",
             "Enter 0121234567 (invalid operator prefix) and submit.",
             "'Enter a valid Bangladeshi mobile number'. The order is not created."),
            ("6.10", "Delivery fee appears",
             "Select District = Dhaka.",
             "The summary switches from 'Select a district' to Tk 60, and shows 'Inside Dhaka City - 1-2 days'."),
            ("6.11", "Delivery fee by zone",
             "Change district to Gazipur, then Chattogram, then Bandarban.",
             "The fee and day range change to the suburbs / divisional / nationwide zone respectively, matching /admin/settings."),
            ("6.12", "Free delivery threshold",
             "Build a Dhaka cart over Tk 5,000 and select Dhaka.",
             "Delivery shows 'Free' in green and adds nothing to the total."),
            ("6.13", "Total arithmetic",
             "With a coupon and a delivery fee applied, check the maths.",
             "Total = Subtotal - Discount + Delivery, exactly. This is enforced by a database constraint."),
            ("6.14", "Payment methods shown",
             "Look at the Payment method section.",
             "Only Cash on delivery, plus a note that online options appear once credentials are configured. bKash/Nagad/Card must NOT appear as dead options."),
            ("6.15", "COD advance warning",
             "Build a cart over Tk 50,000 and select Cash on delivery.",
             "An amber notice explains an advance payment is needed before dispatch. You can still place the order."),
            ("6.16", "Guest checkout",
             "Complete checkout while signed out.",
             "The order is created. A note offers signing in to save the address."),
            ("6.17", "Saved addresses",
             "Sign in with at least one saved address and open checkout.",
             "Saved addresses are listed as radio options; the default is pre-selected and its fields pre-fill. 'Use a different address' clears them."),
            ("6.18", "Save address on order",
             "As a signed-in customer, tick 'Save this address for next time' and order.",
             "The address appears in /account/addresses afterwards."),
            ("6.19", "Place order (COD)",
             "Complete every field and click Place order.",
             "You land on the confirmation page with an order number in the form BD-1000xx."),
            ("6.20", "Stock decrements",
             "Note a product's stock, order 2 of it, then check stock in admin.",
             "Stock has dropped by exactly 2. Units sold has risen by 2."),
            ("6.21", "PRICE TAMPERING (must fail)",
             "Open DevTools, add a hidden input named total_paisa with value 1 to the checkout form, then submit.",
             "The order is created at the CORRECT price. The injected value is ignored entirely. If the order total is Tk 0.01, STOP and report immediately."),
            ("6.22", "Concurrent stock race",
             "With stock = 1, open checkout in two browsers and submit both within a second.",
             "Exactly one order succeeds. The other is told stock changed. Stock never goes negative."),
            ("6.23", "Coupon usage recorded",
             "Order with a coupon, then check the coupon in admin.",
             "Its 'Used' count has incremented by one."),
        ],
    ),
    (
        "7. Order confirmation and tracking",
        "Tracking needs the order number AND the phone number - order numbers "
        "come from a sequence and are therefore guessable on their own.",
        [
            ("7.1", "Confirmation page",
             "Complete an order.",
             "Thank-you message with your first name, the order number, a full price breakdown, the payment badge, an estimated arrival date and your area/district."),
            ("7.2", "Confirmation actions",
             "Click 'Track this order' and 'Keep shopping'.",
             "Tracking opens pre-filled with the order number; Keep shopping returns to the catalogue."),
            ("7.3", "Track with correct details",
             "On /track enter the order number and the phone used on the order.",
             "The order appears with a status timeline, item list and totals."),
            ("7.4", "Track with wrong phone",
             "Enter a valid order number but a different phone number.",
             "A single generic message: 'No order matches that number and mobile number.' It must NOT reveal that the order exists."),
            ("7.5", "Track a non-existent order",
             "Enter BD-999999 with any phone.",
             "The same generic message as 7.4 - identical wording, so the form cannot be used to discover valid order numbers."),
            ("7.6", "Track accepts +880",
             "Track using +8801712345678 for an order placed with 01712345678.",
             "The order is found - the phone is normalised before lookup."),
            ("7.7", "Timeline progresses",
             "In admin advance the order: Confirmed, Processing, Shipped, Out for delivery, Delivered. Re-track after each step.",
             "The timeline highlights the current step, ticks completed steps in green, and shows the timestamp for each."),
            ("7.8", "Cancelled order display",
             "Cancel an order in admin, then track it.",
             "A red 'Cancelled' panel with the reason, instead of the step timeline."),
            ("7.9", "No internal data leaks",
             "Track any order and inspect the page.",
             "The internal staff note and product cost are NOT present anywhere in the response."),
        ],
    ),
    (
        "8. Accounts and authentication",
        "",
        [
            ("8.1", "Sign up",
             "Create an account with name, email, optional phone and an 8+ character password.",
             "Either you are signed in, or you are told to check your inbox to confirm (depending on the Supabase email setting)."),
            ("8.2", "Weak password rejected",
             "Try to sign up with a 4-character password.",
             "'Use at least 8 characters'. No account is created."),
            ("8.3", "Profile auto-created",
             "After signing up, open /account.",
             "Your name and email are already populated - a database trigger creates the profile."),
            ("8.4", "New users are customers",
             "Sign up, then try to open /admin.",
             "You are redirected away. New accounts are never staff."),
            ("8.5", "Sign in",
             "Sign in with correct credentials.",
             "You land on /account (or wherever you were heading)."),
            ("8.6", "Wrong password",
             "Sign in with a correct email but wrong password.",
             "'That email and password do not match.' The wording must NOT reveal whether the email exists."),
            ("8.7", "Unknown email",
             "Sign in with an email that has no account.",
             "The exact same message as 8.6."),
            ("8.8", "Return-to after sign-in",
             "While signed out, open /account/orders. Sign in when prompted.",
             "After signing in you land on /account/orders, not the generic account page."),
            ("8.9", "Signed-in users skip auth pages",
             "While signed in, visit /sign-in.",
             "You are redirected away - there is no reason to see the sign-in form."),
            ("8.10", "Forgot password",
             "Submit your email on /forgot-password.",
             "'If that email has an account, a reset link is on its way.' The same message shows for unknown emails."),
            ("8.11", "Reset password",
             "Open the emailed link and set a new password.",
             "The password is changed and you land on your account. The old password no longer works."),
            ("8.12", "Expired reset link",
             "Open /reset-password directly, with no token.",
             "'This reset link has expired or has already been used.' - not a broken form."),
            ("8.13", "Sign out",
             "Click Sign out in the account sidebar.",
             "You return to the homepage as a guest and /account is no longer reachable."),
            ("8.14", "Protected routes",
             "While signed out, visit /account, /account/orders, /account/addresses and /account/wishlist.",
             "Each redirects to sign-in."),
        ],
    ),
    (
        "9. Customer account area",
        "",
        [
            ("9.1", "Overview tiles",
             "Open /account.",
             "Three tiles - Orders, Wishlist, Addresses - with correct counts, plus your three most recent orders."),
            ("9.2", "Update profile",
             "Change your name and phone and save.",
             "'Profile updated.' The header greeting updates to the new first name."),
            ("9.3", "Marketing opt-in",
             "Tick the marketing checkbox and save, then reload.",
             "The setting persists."),
            ("9.4", "Orders list",
             "Open /account/orders.",
             "Every order you placed, newest first, with number, status badge, item summary, date and total."),
            ("9.5", "Order detail",
             "Open an order.",
             "Status timeline, item list with images, price breakdown and the delivery address exactly as entered."),
            ("9.6", "Cancel an order",
             "Open an order that is still Placed or Confirmed and cancel it with a reason.",
             "The order becomes Cancelled and every item's stock is returned - verify the stock in admin."),
            ("9.7", "Cancel blocked after dispatch",
             "Advance an order to Shipped in admin, then try to cancel it as the customer.",
             "The cancel button is not offered. (If forced via the API it must be refused.)"),
            ("9.8", "Cannot see other customers' orders",
             "Copy another customer's order URL and open it while signed in as yourself.",
             "404 or empty - row-level security blocks it. This is a hard requirement."),
            ("9.9", "Wishlist",
             "Save two products, then open /account/wishlist.",
             "Both appear, most recently saved first, with live prices."),
            ("9.10", "Wishlist empty state",
             "Remove everything from the wishlist.",
             "A tidy empty state with a 'Browse products' button."),
            ("9.11", "Add an address",
             "Add an address with all fields and mark it default.",
             "It is listed with a 'Default' badge and pre-selects at checkout."),
            ("9.12", "Only one default",
             "Mark a second address as default.",
             "The first loses its Default badge. Exactly one default exists at all times."),
            ("9.13", "Edit an address",
             "Edit an address and save.",
             "Changes persist and show at checkout."),
            ("9.14", "Delete an address",
             "Delete an address.",
             "It disappears. Past orders that used it are NOT affected - order addresses are snapshots."),
            ("9.15", "Address phone validation",
             "Save an address with an invalid phone.",
             "Inline validation error; nothing is saved."),
            ("9.16", "Change password",
             "Open /account/password, set a new password.",
             "The change succeeds and the new password works on next sign-in."),
        ],
    ),
    (
        "10. Admin - access control",
        "Test these first. Everything else in the admin panel depends on them "
        "holding. Middleware redirects are a convenience; the real enforcement "
        "is in the database.",
        [
            ("10.1", "Signed-out access",
             "Sign out and visit /admin.",
             "You are redirected to sign-in."),
            ("10.2", "Customer access",
             "Sign in as an ordinary customer and visit /admin.",
             "You are redirected to the homepage. No admin data is visible at any point."),
            ("10.3", "Grant admin",
             "Run: node scripts/make-admin.mjs your@email.com. Sign out and back in.",
             "/admin opens and the black Admin button appears in the storefront nav."),
            ("10.4", "Manager restrictions",
             "Set an account to manager (make-admin.mjs email manager) and sign in.",
             "The admin panel opens, but 'Settings' is absent from the sidebar and /admin/settings redirects away."),
            ("10.5", "Manager cannot change roles",
             "As a manager, open /admin/customers.",
             "Roles are shown as read-only badges, with no dropdown."),
            ("10.6", "Admin cannot demote themselves",
             "As an admin, try to change your own role on /admin/customers.",
             "Your own row shows a 'You' badge and cannot be edited."),
            ("10.7", "Admin pages are not indexed",
             "View source on an admin page and check /robots.txt.",
             "Admin carries a noindex directive and /admin is disallowed in robots.txt."),
        ],
    ),
    (
        "11. Admin - dashboard, products and stock",
        "",
        [
            ("11.1", "Dashboard tiles",
             "Open /admin.",
             "Eight tiles: today's sales, this month, gross margin, pending orders, delivered, customers, low stock, reviews to moderate. Figures match reality."),
            ("11.2", "Dashboard tiles link",
             "Click the Pending orders, Customers, Low stock and Reviews tiles.",
             "Each opens the matching filtered page."),
            ("11.3", "Revenue chart",
             "Look at the 30-day chart.",
             "Placing a new order today raises today's point. Cancelled and returned orders are excluded."),
            ("11.4", "Best sellers panel",
             "Check the best-sellers list.",
             "Ordered by units sold, with thumbnails and prices."),
            ("11.5", "Low stock table",
             "Check the low-stock table.",
             "Lowest stock first, colour-coded, with an OK / Low / Out of stock badge."),
            ("11.6", "Product list",
             "Open /admin/products.",
             "Every product with thumbnail, SKU, category, price, MARGIN, stock, units sold and status."),
            ("11.7", "Margin visible to staff only",
             "Compare the margin column with the storefront.",
             "Margin and cost appear in admin but are absent from every public page and API response. (Cost is revoked at the database column level.)"),
            ("11.8", "Product search",
             "Search by name, then by SKU.",
             "Both narrow the list correctly."),
            ("11.9", "Status filter",
             "Click All / Active / Draft / Archived.",
             "The list filters accordingly."),
            ("11.10", "Create a product",
             "Click New product, fill name, SKU, price, stock, set status Active, save.",
             "The product is created and immediately visible on the storefront."),
            ("11.11", "Slug auto-generation",
             "Create a product leaving Slug blank.",
             "A URL-safe slug is generated from the name."),
            ("11.12", "Duplicate SKU rejected",
             "Create a product reusing an existing SKU.",
             "'That slug or SKU is already in use.' Nothing is saved."),
            ("11.13", "Compare-at validation",
             "Set a compare-at price LOWER than the selling price and save.",
             "'The compare-at price must be higher than the selling price.' Saved only when corrected."),
            ("11.14", "Features and specs parsing",
             "Enter features one per line, and specs as 'Label: value' one per line. Save and view the product page.",
             "Features render as a ticked list; specs render as a two-column table."),
            ("11.15", "Prices entered in Taka",
             "Enter 1234.50 as the price, save, and view the storefront.",
             "It displays as Tk 1,234.50. (Stored internally as paisa - you never type paisa.)"),
            ("11.16", "Edit a product",
             "Change the name and price of an existing product and save.",
             "Changes appear on the storefront (allow up to 5 minutes for the cached homepage)."),
            ("11.17", "Publish / unpublish",
             "Click the eye icon on an Active product, then again.",
             "It toggles between Active and Draft. A Draft product 404s publicly."),
            ("11.18", "Archive",
             "Archive a product.",
             "It leaves the storefront but past orders containing it still display correctly - orders keep their own snapshot."),
            ("11.19", "Stock page",
             "Open /admin/stock.",
             "Counters for out-of-stock, low and tracked products, plus an editable table sorted lowest-first."),
            ("11.20", "Inline stock edit",
             "Change a stock number and click away (or press Enter).",
             "It saves immediately with a green tick. Reload to confirm it persisted."),
            ("11.21", "Negative stock rejected",
             "Try to set stock to -5.",
             "Rejected; the value reverts."),
            ("11.22", "Variant stock roll-up",
             "Change a variant's stock, then look at the parent product's stock.",
             "The parent equals the sum of its active variants - maintained by a database trigger."),
        ],
    ),
    (
        "12. Admin - categories, orders and payments",
        "",
        [
            ("12.1", "Category list",
             "Open /admin/categories.",
             "All categories with slug, icon, product count, position and status."),
            ("12.2", "Create a category",
             "Create one with a Lucide icon name (e.g. Headphones) and a position.",
             "It appears in the storefront nav and the homepage category grid with that icon."),
            ("12.3", "Invalid icon name",
             "Set the icon to 'NotARealIcon' and save.",
             "The tile falls back to a default package icon rather than crashing the homepage."),
            ("12.4", "Reorder categories",
             "Change positions and reload the storefront.",
             "Nav and grid order follow the position values (lowest first)."),
            ("12.5", "Deactivate a category",
             "Untick Active.",
             "It disappears from the storefront nav but its products remain reachable."),
            ("12.6", "Delete blocked while in use",
             "Try to delete a category that has products.",
             "'N products still use this category. Move them first...' Nothing is deleted."),
            ("12.7", "Delete an empty category",
             "Create an empty category and delete it.",
             "It is removed."),
            ("12.8", "Order list",
             "Open /admin/orders.",
             "All orders with number, customer, destination, item count, total, payment and status."),
            ("12.9", "Order status tabs",
             "Click each status tab.",
             "The list filters to that status."),
            ("12.10", "Order search",
             "Search by order number, then by phone, then by customer name.",
             "All three find the order."),
            ("12.11", "Order detail",
             "Open an order.",
             "Fulfilment controls, timeline, items, totals, customer contact, shipping address, customer note and the internal note box."),
            ("12.12", "Legal transitions only",
             "Look at the buttons offered for a Placed order.",
             "Only Confirmed and Cancelled. You cannot jump straight to Delivered."),
            ("12.13", "Advance an order",
             "Move an order Placed to Confirmed to Processing to Shipped to Out for delivery to Delivered.",
             "Each step succeeds, is timestamped, and appears on the customer's tracking page."),
            ("12.14", "Status note reaches the customer",
             "Add a note when changing status, then view the customer tracking page.",
             "The note appears against that step."),
            ("12.15", "COD settles on delivery",
             "Mark a COD order Delivered, then check /admin/payments.",
             "Its payment status becomes 'successful' automatically."),
            ("12.16", "Cancel restores stock",
             "Note a product's stock, cancel an order containing it, then re-check.",
             "Stock is restored by exactly the ordered quantity and units sold is reduced."),
            ("12.17", "Terminal statuses",
             "Open a Cancelled order.",
             "No further transitions are offered, and a note explains why."),
            ("12.18", "Internal note is private",
             "Save an internal note, then view the same order as the customer and on /track.",
             "The note is invisible to the customer in both places."),
            ("12.19", "Payments page",
             "Open /admin/payments.",
             "Collected and outstanding totals, the list of live payment methods, and a row per payment attempt with its gateway reference."),
            ("12.20", "Payment method gating",
             "Check the 'Live methods' card.",
             "Only Cash on delivery until bKash/Nagad/card credentials are added AND the id is listed in PAYMENTS_ENABLED_PROVIDERS."),
        ],
    ),
    (
        "13. Admin - customers, coupons, banners and reviews",
        "",
        [
            ("13.1", "Customer list",
             "Open /admin/customers.",
             "Every registered account with name, email, phone, order count, lifetime spend, join date and role."),
            ("13.2", "Customer search",
             "Search by name, email and phone.",
             "All three work."),
            ("13.3", "Spend excludes cancellations",
             "Cancel one of a customer's orders and re-check their spend.",
             "The cancelled order's value is excluded."),
            ("13.4", "Promote a customer",
             "As an admin, change a customer's role to manager, confirm the prompt.",
             "The role updates. That account can now open /admin but not /admin/settings."),
            ("13.5", "Coupon list",
             "Open /admin/coupons.",
             "Every coupon with discount, minimum order, usage, window and a Live / Paused / Expired / Used up badge."),
            ("13.6", "Create a percentage coupon",
             "Create a 15% coupon with a Tk 1,000 minimum and a Tk 500 cap.",
             "It applies at checkout, respects the minimum, and never discounts more than Tk 500."),
            ("13.7", "Create a fixed coupon",
             "Create a flat Tk 300 coupon.",
             "It reduces the total by exactly Tk 300."),
            ("13.8", "Percentage over 100 rejected",
             "Try to save a percentage coupon with value 150.",
             "'A percentage discount cannot exceed 100.'"),
            ("13.9", "Duplicate code rejected",
             "Create a coupon reusing an existing code.",
             "'That code already exists.'"),
            ("13.10", "Pause a coupon",
             "Pause a coupon, then try to use it at checkout.",
             "It is rejected as inactive."),
            ("13.11", "Usage limit",
             "Set a coupon's total usage limit to 1 and use it once, then try again from another account.",
             "The second attempt is rejected as exhausted."),
            ("13.12", "Banner list",
             "Open /admin/banners.",
             "Every banner grouped by placement, with a preview image and its priority."),
            ("13.13", "Create a hero banner",
             "Create a hero banner with eyebrow, title, subtitle, image URL, button label/link and an accent hex.",
             "It appears in the homepage carousel and the accent colour tints the gradient."),
            ("13.14", "Banner priority",
             "Give a banner the highest priority.",
             "It becomes the first hero slide."),
            ("13.15", "Invalid accent colour",
             "Enter 'blue' as the accent hex and save.",
             "'Accent must be a hex colour like #1B4DFF.'"),
            ("13.16", "Hide a banner",
             "Untick 'Show on the storefront'.",
             "It disappears from the homepage but remains editable in admin."),
            ("13.17", "Delete a banner",
             "Delete a banner and confirm.",
             "It is removed from both admin and the homepage."),
            ("13.18", "Offer card placement",
             "Create a banner with placement 'Offer card'.",
             "It appears in the three-up card row, not the hero."),
            ("13.19", "Review moderation queue",
             "Open /admin/reviews.",
             "Pending reviews with rating, verified-purchase badge, author, product and body."),
            ("13.20", "Approve a review",
             "Approve a pending review, then open that product's page.",
             "The review is publicly visible AND the product's average rating and count have updated."),
            ("13.21", "Reject a review",
             "Reject a review.",
             "It never appears publicly and does not affect the rating."),
            ("13.22", "Un-approve a review",
             "Approve then reject the same review, and watch the product rating.",
             "The rating rolls back correctly - the rollup is maintained by a database trigger."),
            ("13.23", "Verified purchase flag",
             "Compare a review from a delivered order with one from an account without a delivered order.",
             "Only the genuine purchase shows 'Verified purchase'. The flag is set by the database, never by the reviewer."),
        ],
    ),
    (
        "14. Admin - reports and settings",
        "",
        [
            ("14.1", "Report windows",
             "Open /admin/reports and switch between 7, 30, 90 and 180 days.",
             "Every figure and the chart recalculate for the chosen window."),
            ("14.2", "Revenue and profit tiles",
             "Check the eight tiles.",
             "Revenue, gross profit, cost of goods, average order, discounts given, delivery collected, cancellations and margin percentage."),
            ("14.3", "Margin maths",
             "Compare gross profit against revenue minus cost of goods.",
             "They agree. Margin % = gross profit / revenue."),
            ("14.4", "Products without cost",
             "Check a product that has no cost recorded.",
             "Its margin shows as a dash rather than a misleading 100%."),
            ("14.5", "Product performance",
             "Check the performance table.",
             "Top 20 by revenue, with units, revenue, profit and margin per product."),
            ("14.6", "Payment mix",
             "Check the payment mix panel.",
             "A bar per method with counts and percentages that sum to 100%."),
            ("14.7", "Cancelled orders excluded",
             "Note the revenue, cancel an order in the window, then reload.",
             "Revenue falls by that order's value."),
            ("14.8", "Settings page (admin only)",
             "Open /admin/settings as an admin.",
             "Editable store configuration plus the delivery zone manager."),
            ("14.9", "Change the store name",
             "Change store_name and save, then open the storefront.",
             "The header, footer and page titles all use the new name."),
            ("14.10", "Change support details",
             "Change support_phone and support_hours, then check the storefront.",
             "The header strip, footer and contact page all update."),
            ("14.11", "Structured settings are read-only",
             "Look at social_links and currency.",
             "Shown as read-only JSON with an explanation - a malformed value here would break the storefront."),
            ("14.12", "Edit a delivery zone",
             "Change the Inside Dhaka fee to Tk 80 and save. Then run a checkout to Dhaka.",
             "Checkout charges Tk 80. The footer table also shows Tk 80. No deploy needed."),
            ("14.13", "Free-delivery threshold",
             "Change a zone's 'Free above' value, then test a cart above and below it.",
             "Delivery is free above the threshold and charged below it."),
            ("14.14", "Add a delivery zone",
             "Create a zone listing specific districts.",
             "Checkout to one of those districts uses the new zone's fee and timing."),
            ("14.15", "Day range validation",
             "Set maximum days lower than minimum days.",
             "'Maximum days cannot be less than minimum days.'"),
            ("14.16", "Fallback zone",
             "Check out to a district not listed in any zone.",
             "The fallback zone ('Rest of Bangladesh') is applied - never a missing or zero fee."),
        ],
    ),
    (
        "15. Cross-cutting: responsive, SEO, errors and security",
        "",
        [
            ("15.1", "Mobile - homepage",
             "Open the homepage on a real phone (or a 375px window).",
             "No horizontal scrolling anywhere. Hero text is readable and never overlapped by the carousel controls."),
            ("15.2", "Mobile - navigation drawer",
             "Open the hamburger drawer on a phone.",
             "It covers the full screen height with every category listed. (This was previously broken - please confirm.)"),
            ("15.3", "Mobile - listing and filters",
             "Browse the listing and open the Filters sheet on a phone.",
             "Two columns of cards; the filter sheet opens from the bottom and closes cleanly."),
            ("15.4", "Mobile - product page",
             "Open a product on a phone.",
             "Gallery, buy box, specs and reviews all stack readably. Buttons are comfortably tappable."),
            ("15.5", "Mobile - cart and checkout",
             "Complete a full purchase on a phone.",
             "Every field is reachable, the keyboard does not obscure the submit button, and the order completes."),
            ("15.6", "Tablet",
             "Repeat the key pages at ~768px.",
             "Layouts adapt without overlap or clipping."),
            ("15.7", "Page titles",
             "Check the browser tab on the homepage, a category, a product and the cart.",
             "Each has a distinct, descriptive title ending in 'Nazmul'."),
            ("15.8", "Product structured data",
             "View source on a product page and search for application/ld+json.",
             "Valid Product schema with price, currency BDT and availability."),
            ("15.9", "Sitemap",
             "Open /sitemap.xml.",
             "Homepage, listing, categories, all active products and the policy pages. No admin, cart or checkout URLs."),
            ("15.10", "Robots",
             "Open /robots.txt.",
             "/admin, /account, /checkout, /cart, /api/ and /order/ are disallowed; the sitemap is referenced."),
            ("15.11", "404 page",
             "Visit /this-page-does-not-exist.",
             "The branded 404 with links home and to the catalogue - not a raw framework error."),
            ("15.12", "Policy pages",
             "Open About, Contact, FAQ, Shipping, Delivery, Returns, Warranty, Privacy, Terms and Authenticity.",
             "All render with real content. Shipping and Delivery show the live delivery-zone table."),
            ("15.13", "FAQ accordion",
             "Open /faq and click several questions.",
             "Each expands and collapses; the + rotates."),
            ("15.14", "Cost never leaks",
             "On a product page, open DevTools, and search the HTML and every network response for the cost value.",
             "The purchase cost appears NOWHERE. It is revoked at the database column level for public roles."),
            ("15.15", "Coupon codes are not enumerable",
             "While signed out, try to read the coupons table through the public API.",
             "Nothing is returned. Coupons have no public read policy."),
            ("15.16", "Cannot read another user's data",
             "Signed in as customer A, try to fetch customer B's orders and addresses via the API.",
             "Empty results. Row-level security scopes every read to the signed-in user."),
            ("15.17", "Cannot create an order directly",
             "Try to POST a row into the orders table through the public API.",
             "Refused. Orders have no insert policy - only the server-side place_order() function can create them."),
            ("15.18", "Session persistence",
             "Sign in, close the browser, reopen the site.",
             "You are still signed in."),
        ],
    ),
    (
        "16. Homepage campaign tiles",
        "Tall portrait cards with a Bangla headline over the artwork, driven by "
        "banner rows with placement 'category_tile'. Everything about them is "
        "editable at /admin/banners.",
        [
            ("16.1", "Tiles render",
             "Open the homepage and scroll to 'Featured collections'.",
             "A horizontal row of tall cards, each with a Bangla headline across the top and a title, caption and link at the bottom."),
            ("16.2", "Bangla renders correctly",
             "Look closely at the Bangla headline on each tile.",
             "Real Bangla letterforms - NOT empty boxes, question marks or garbled marks. Conjuncts join properly."),
            ("16.3", "Tiles scroll",
             "Drag or scroll the row sideways, on desktop and on a phone.",
             "It scrolls smoothly and snaps to cards. No scrollbar is visible and the page itself never scrolls sideways."),
            ("16.4", "Tile links",
             "Click each tile.",
             "Each opens the category it advertises - Gaming Zone to gaming accessories, Audio Paradise to earbuds, and so on."),
            ("16.5", "Hover effect",
             "Hover a tile on a desktop.",
             "The photograph scales up slightly inside the rounded frame and the arrow nudges right. The frame itself does not move."),
            ("16.6", "Text stays readable",
             "Check the caption over the lightest part of each photograph.",
             "The bottom gradient keeps the title and caption legible on every tile."),
            ("16.7", "Edit a tile in admin",
             "In /admin/banners edit a Category tile - change its Bangla eyebrow, title, caption and link. Save, then reload the homepage.",
             "Every change appears (allow up to 5 minutes for the cached homepage)."),
            ("16.8", "Accent colour",
             "Change a tile's accent hex and reload.",
             "The colour wash over the top of that tile changes to match."),
            ("16.9", "Add a tile",
             "Create a banner with placement 'Category tile', an image URL and a priority.",
             "It joins the row in priority order, highest first."),
            ("16.10", "Hide a tile",
             "Untick 'Show on the storefront' on one tile.",
             "It disappears from the homepage and the rest close up with no gap."),
            ("16.11", "Section hides when empty",
             "Deactivate every category tile and reload.",
             "The whole 'Featured collections' section disappears - no empty heading."),
        ],
    ),
    (
        "17. Manual bKash / Nagad payment - customer",
        "Requires migration 0015 applied AND bkash/nagad listed in "
        "PAYMENTS_ENABLED_PROVIDERS. The customer sends money themselves and "
        "submits proof; nothing marks the order paid except a staff decision.",
        [
            ("17.1", "Method appears at checkout",
             "With bkash enabled, go to checkout.",
             "bKash appears alongside Cash on delivery, described as sending money then submitting the transaction ID."),
            ("17.2", "Redirected to the payment page",
             "Choose bKash and place the order.",
             "You land on /order/pay with your order number, NOT on the normal confirmation page."),
            ("17.3", "Amount and number shown",
             "Read the 'Send exactly' step.",
             "The exact order total and the store's bKash number, with the account type (Personal/Agent/Merchant)."),
            ("17.4", "Copy the number",
             "Tap the number.",
             "It copies to the clipboard and the button confirms 'Copied'."),
            ("17.5", "Submit without a screenshot",
             "Enter a transaction ID, the sending number and the order's mobile number. Leave the screenshot empty and submit.",
             "Accepted - the screenshot is encouraged but optional. A panel confirms it is awaiting verification."),
            ("17.6", "Submit with a screenshot",
             "Repeat, attaching a JPG or PNG.",
             "A thumbnail preview appears before submitting and can be removed. Submission succeeds."),
            ("17.7", "Oversized screenshot rejected",
             "Attach an image larger than 5 MB.",
             "'That screenshot is larger than 5 MB.' Nothing is uploaded."),
            ("17.8", "Wrong file type rejected",
             "Attach a PDF or a GIF.",
             "Rejected as an unsupported image type."),
            ("17.9", "Wrong order phone rejected",
             "Enter a mobile number that is not the one on the order.",
             "'No order matches that number and mobile number.' Nothing is recorded and no file is stored."),
            ("17.10", "Duplicate transaction ID rejected",
             "Submit a transaction ID that was already used on a different order.",
             "'That transaction ID has already been submitted against another order.' CRITICAL - this is what stops one payment being claimed twice."),
            ("17.11", "Order is not marked paid",
             "After submitting, track the order.",
             "Payment status is still pending. Submitting proof must NEVER mark an order paid by itself."),
            ("17.12", "Resubmission after a mistake",
             "Submit again with a corrected transaction ID.",
             "The newer submission replaces the old one and any previous rejection reason is cleared."),
            ("17.13", "Page for a COD order",
             "Open /order/pay?ref= with a COD order number.",
             "A tidy 'Nothing to pay here' message with a link to tracking - not a 404."),
            ("17.14", "Already-verified order",
             "Open the payment page for an order that was already approved.",
             "'This payment has already been verified' and no form."),
        ],
    ),
    (
        "18. Manual payment verification - admin",
        "The queue sits at the top of /admin/payments and needs the Payments "
        "permission.",
        [
            ("18.1", "Queue badge",
             "With at least one submission pending, look at the admin sidebar.",
             "An amber count sits next to Payments."),
            ("18.2", "Queue contents",
             "Open /admin/payments.",
             "'Awaiting verification' is first on the page, listing each submission with order number, customer, transaction ID, sending number, expected amount and submission time."),
            ("18.3", "View the screenshot",
             "Click 'View screenshot' on a submission.",
             "The image loads inline. Clicking it opens full size in a new tab."),
            ("18.4", "Screenshots are private",
             "Copy a screenshot URL, then open it in a private window a few minutes later.",
             "It expires and stops working. CRITICAL - proofs must never be reachable by URL guessing."),
            ("18.5", "Approve a payment",
             "Click 'Verify & confirm order' and accept the prompt.",
             "Payment becomes successful, the order moves Placed to Confirmed, and the customer's tracking page shows 'Payment verified'."),
            ("18.6", "Approval is attributed",
             "Look at the card after approving.",
             "'Verified by <your name> on <date>'. The decision is recorded against a named account."),
            ("18.7", "Reject a payment",
             "Reject one with a reason such as 'no matching transaction'.",
             "Payment becomes failed and the reason is stored."),
            ("18.8", "Rejection does not cancel the order",
             "Check the order after rejecting.",
             "The order is still open so the customer can correct the ID and resubmit. It must NOT be auto-cancelled."),
            ("18.9", "Approval is idempotent",
             "Approve, then try to act on the same payment again.",
             "No further buttons are offered and the payment stays successful."),
            ("18.10", "No permission, no verification",
             "As a manager WITHOUT the Payments permission, open /admin/payments.",
             "You are redirected to the dashboard, and Payments is absent from the sidebar."),
            ("18.11", "Receive numbers are editable",
             "In /admin/settings change bkash_receive_number, then reopen a payment page.",
             "The new number is shown. No deploy needed."),
        ],
    ),
    (
        "19. Staff and permissions",
        "Admin-only. Admins are unrestricted; managers get exactly the sections "
        "ticked for them.",
        [
            ("19.1", "Staff page is admin-only",
             "Open /admin/staff as a manager.",
             "Redirected away, and Staff is absent from their sidebar."),
            ("19.2", "Staff list",
             "Open /admin/staff as an admin.",
             "Every admin and manager, with their role and - for managers - the sections they hold."),
            ("19.3", "Add by email",
             "Click 'Add a staff member', type the email of an existing account and click Find.",
             "The account is found and shown by name."),
            ("19.4", "Unknown email",
             "Search an email with no account.",
             "'No account with that email. Ask them to sign up first' - it does not create the user."),
            ("19.5", "Grant a manager limited access",
             "Add them as Manager with only Orders and Products ticked.",
             "They are added with exactly those two grants."),
            ("19.6", "Manager sees only their sections",
             "Sign in as that manager and open /admin.",
             "The sidebar shows Dashboard, Orders and Products only. Coupons, Reports, Customers and the rest are absent."),
            ("19.7", "Direct URL is blocked too",
             "As that manager, type /admin/reports into the address bar.",
             "Redirected to the dashboard. CRITICAL - hiding the link is not enough, the page itself must refuse."),
            ("19.8", "Actions are blocked too",
             "As that manager, try to trigger a coupon change through the API.",
             "Refused. The SQL function re-checks the permission independently of the UI."),
            ("19.9", "Change someone's grants",
             "Add Reports to that manager and save. Have them reload.",
             "Reports appears in their sidebar and opens."),
            ("19.10", "Revoke a section",
             "Untick Orders and save.",
             "It disappears from their nav and the page redirects if they try it directly."),
            ("19.11", "Manager with nothing granted",
             "Save a manager with zero sections ticked.",
             "A red warning says they will only see the dashboard."),
            ("19.12", "Promote to admin",
             "Change a manager to Admin.",
             "The permission grid disappears with a warning that admins are unrestricted. They now see every section including Staff and Settings."),
            ("19.13", "Demote to customer",
             "Set a staff member's role to Customer.",
             "They lose admin access entirely; their orders and account are untouched."),
            ("19.14", "Cannot edit yourself",
             "Find your own row on /admin/staff.",
             "It is marked 'You' with no edit button. CRITICAL - this is what prevents an admin locking themselves out."),
            ("19.15", "Settings and Staff are not grantable",
             "Look at the permission checkboxes for a manager.",
             "Settings and Staff are not offered at all, with a note explaining why."),
            ("19.16", "Existing managers keep access",
             "After applying migration 0015, sign in as a manager who existed beforehand.",
             "They still have every section they had before - the migration backfills their grants rather than locking them out."),
        ],
    ),
]


# ------------------------------------------------------------------- layout --
def header_footer(canvas, doc):
    canvas.saveState()
    w, h = PAGE

    canvas.setFillColor(INK)
    canvas.rect(0, h - 12 * mm, w, 12 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(MARGIN, h - 8.2 * mm, "Nazmul Commerce")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.HexColor("#B9C4FF"))
    canvas.drawString(MARGIN + 32 * mm, h - 8.2 * mm, "Manual QA test plan")

    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(w - MARGIN, h - 8.2 * mm, "bidyut-commerce.vercel.app")

    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 11 * mm, w - MARGIN, 11 * mm)
    canvas.setFillColor(INK_MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(MARGIN, 7 * mm, "Tester: ______________________     Date: ____________     Build / commit: ____________")
    canvas.drawRightString(w - MARGIN, 7 * mm, f"Page {doc.page}")
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    w, h = PAGE
    canvas.setFillColor(BRAND)
    canvas.rect(0, h - 46 * mm, w, 46 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 30)
    canvas.drawString(MARGIN, h - 26 * mm, "Nazmul Commerce")
    canvas.setFont("Helvetica", 15)
    canvas.setFillColor(colors.HexColor("#D5DEFF"))
    canvas.drawString(MARGIN, h - 35 * mm, "Manual QA test plan - storefront and admin panel")
    canvas.restoreState()


def build():
    out = r"C:\Users\USER\AppData\Local\Temp\claude\D--ECOM\4bc6e13b-821c-4ecf-884a-e7205ad4e829\scratchpad\Nazmul-QA-Test-Plan.pdf"

    doc = BaseDocTemplate(
        out,
        pagesize=PAGE,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=18 * mm,
        bottomMargin=14 * mm,
        title="Nazmul Commerce - Manual QA Test Plan",
        author="Nazmul Commerce",
        subject="Manual test plan covering every storefront and admin feature",
    )

    frame = Frame(MARGIN, 14 * mm, PAGE[0] - 2 * MARGIN, PAGE[1] - 32 * mm, id="body")
    cover_frame = Frame(MARGIN, 20 * mm, PAGE[0] - 2 * MARGIN, PAGE[1] - 68 * mm, id="cover")

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=cover),
        PageTemplate(id="body", frames=[frame], onPage=header_footer),
    ])

    story = []

    # ---- cover ----
    total = sum(len(s[2]) for s in SECTIONS)
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        f"{total} test cases across {len(SECTIONS)} areas", H2))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "This document covers every feature that exists in the build - storefront, "
        "checkout, customer accounts and the full admin panel. Work through it in "
        "order: the access-control section (10) should be done before the rest of "
        "the admin sections, because everything after it assumes those controls hold.",
        BODY))
    story.append(Spacer(1, 4 * mm))

    setup = [
        ["Environment", "Value"],
        ["Live site", "https://bidyut-commerce.vercel.app"],
        ["Admin panel", "https://bidyut-commerce.vercel.app/admin"],
        ["Local", "npm run dev  ->  http://localhost:3000"],
        ["Make yourself admin", "node scripts/make-admin.mjs your@email.com   (then sign out and back in)"],
        ["Make someone a manager", "node scripts/make-admin.mjs their@email.com manager"],
        ["Reset demo catalogue", "node scripts/seed-catalog.mjs --banners --flash"],
        ["Test coupons", "BIDYUT10 (10%, min Tk 5,000, cap Tk 1,500) - WELCOME200 (Tk 200 off, min Tk 3,000) - EIDGIFT (7%, no minimum) - FREESHIP (Tk 150 off, min Tk 2,000)"],
        ["Test phone numbers", "01712345678 / +8801712345678 / 8801712345678 / 1712345678 - all must be accepted"],
        ["Payment", "Cash on delivery only. bKash, Nagad and card are built but hidden until credentials are configured."],
    ]
    t = Table(setup, colWidths=[46 * mm, PAGE[0] - 2 * MARGIN - 46 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.4),
        ("TEXTCOLOR", (0, 1), (0, -1), INK),
        ("TEXTCOLOR", (1, 1), (1, -1), INK_SOFT),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SUNKEN]),
    ]))
    story.append(t)

    story.append(Spacer(1, 5 * mm))
    story.append(Paragraph("How to record a result", H3))
    story.append(Paragraph(
        "Write P (pass) or F (fail) in the Result column. For any F, note what you saw "
        "in the Notes column - the actual behaviour, not just 'broken'. Tests marked "
        "<b>CRITICAL</b> are security or money-handling checks: if one of those fails, "
        "stop and report it before continuing.",
        BODY))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "<b>One thing to know before you start:</b> the homepage is cached for five "
        "minutes. If an admin change does not show up immediately on the homepage, "
        "that is expected - wait, or check the product page directly, before raising a bug.",
        BODY))

    story.append(PageBreak())
    story.append(doc._nextPageTemplateIndex if False else Spacer(0, 0))

    # ---- sections ----
    col_widths = [12 * mm, 34 * mm, 82 * mm, 88 * mm, 15 * mm, 38 * mm]
    scale = (PAGE[0] - 2 * MARGIN) / sum(col_widths)
    col_widths = [c * scale for c in col_widths]

    for idx, (title, intro, cases) in enumerate(SECTIONS):
        block = [Paragraph(title, H2)]
        if intro:
            block.append(Spacer(1, 1.5 * mm))
            block.append(Paragraph(intro, SMALL))
        block.append(Spacer(1, 2.5 * mm))
        story.append(KeepTogether(block))

        data = [[
            Paragraph("<b>ID</b>", S("th", fontName="Helvetica-Bold", textColor=colors.white)),
            Paragraph("<b>Feature</b>", S("th2", fontName="Helvetica-Bold", textColor=colors.white)),
            Paragraph("<b>Steps</b>", S("th3", fontName="Helvetica-Bold", textColor=colors.white)),
            Paragraph("<b>Expected result</b>", S("th4", fontName="Helvetica-Bold", textColor=colors.white)),
            Paragraph("<b>P/F</b>", S("th5", fontName="Helvetica-Bold", textColor=colors.white)),
            Paragraph("<b>Notes</b>", S("th6", fontName="Helvetica-Bold", textColor=colors.white)),
        ]]

        critical_rows = []
        for i, (cid, feature, steps, expected) in enumerate(cases, start=1):
            is_critical = any(
                k in expected for k in ("STOP", "hard requirement", "must NOT", "MUST NOT", "NOWHERE", "never be")
            ) or "TAMPERING" in feature.upper()
            if is_critical:
                critical_rows.append(i)
            data.append([
                Paragraph(cid, CELL_ID),
                Paragraph(feature, CELL_B),
                Paragraph(steps, CELL),
                Paragraph(expected, CELL),
                Paragraph("", CELL),
                Paragraph("", CELL),
            ])

        tbl = Table(data, colWidths=col_widths, repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), BRAND),
            ("GRID", (0, 0), (-1, -1), 0.4, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SUNKEN]),
            ("BACKGROUND", (4, 1), (4, -1), colors.HexColor("#FBFBFA")),
        ]
        for r in critical_rows:
            style.append(("LINEBEFORE", (0, r), (0, r), 2.2, DANGER))
        tbl.setStyle(TableStyle(style))
        story.append(tbl)

        if idx < len(SECTIONS) - 1:
            story.append(PageBreak())

    # ---- sign-off ----
    story.append(PageBreak())
    story.append(Paragraph("Sign-off", H2))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        "Complete this after finishing every section. Do not sign off with an "
        "unresolved CRITICAL failure.", SMALL))
    story.append(Spacer(1, 4 * mm))

    summary = [["Area", "Cases", "Passed", "Failed", "Blocked", "Notes"]]
    for title, _, cases in SECTIONS:
        summary.append([title, str(len(cases)), "", "", "", ""])
    summary.append(["TOTAL", str(total), "", "", "", ""])

    st = Table(summary, colWidths=[78 * mm, 18 * mm, 20 * mm, 20 * mm, 20 * mm,
                                   PAGE[0] - 2 * MARGIN - 156 * mm])
    st.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EEF2FF")),
        ("FONTSIZE", (0, 0), (-1, -1), 8.6),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, SUNKEN]),
    ]))
    story.append(st)

    story.append(Spacer(1, 8 * mm))
    story.append(Paragraph("Outstanding issues", H3))
    story.append(Spacer(1, 2 * mm))
    issues = [["#", "Test ID", "Severity", "What happened", "Owner"]]
    for i in range(1, 9):
        issues.append([str(i), "", "", "", ""])
    it = Table(issues, colWidths=[10 * mm, 22 * mm, 24 * mm,
                                  PAGE[0] - 2 * MARGIN - 96 * mm, 40 * mm], rowHeights=9 * mm)
    it.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.6),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(it)

    story.append(Spacer(1, 10 * mm))
    sign = [
        ["Tested by", "", "Date", ""],
        ["Approved by", "", "Date", ""],
    ]
    sg = Table(sign, colWidths=[30 * mm, 90 * mm, 20 * mm, 60 * mm], rowHeights=12 * mm)
    sg.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("LINEBELOW", (1, 0), (1, -1), 0.6, INK_MUTED),
        ("LINEBELOW", (3, 0), (3, -1), 0.6, INK_MUTED),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(sg)

    doc.build(story)
    print(f"written: {out}")
    print(f"test cases: {total}")


if __name__ == "__main__":
    build()
