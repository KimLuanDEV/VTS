
"use strict";

/* =========================================================
   NOVA GREEN SHOP
   QUẢN LÝ SẢN PHẨM - GIỎ HÀNG - THANH TOÁN
   API: /api/products
========================================================= */


/* =========================================================
   1. KHAI BÁO BIẾN VÀ CẤU HÌNH
========================================================= */

// Danh sách sản phẩm lấy từ máy chủ
let products = [];

// Danh mục đang được chọn
let category = "Tất cả";

// Giỏ hàng của khách
let cart = {};

// Đường dẫn API sản phẩm
const PRODUCTS_API = "/api/products";

// Khóa lưu trữ trên trình duyệt
const CART_STORAGE_KEY = "bc3d_cart";
const ORDER_STORAGE_KEY = "bc3d_orders";


/* =========================================================
   2. CÁC HÀM TIỆN ÍCH
========================================================= */

// Lấy phần tử HTML theo ID
function $(id) {
    return document.getElementById(id);
}

// Định dạng tiền Việt Nam
function money(value) {
    return Number(value).toLocaleString("vi-VN") + "đ";
}

// Chuyển nội dung thành chữ thường để tìm kiếm
function normalizeText(value) {
    return String(value || "")
        .trim()
        .toLocaleLowerCase("vi");
}

// Chống chèn mã HTML khi hiển thị dữ liệu sản phẩm
function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


/* =========================================================
   3. ĐỌC VÀ LƯU GIỎ HÀNG
========================================================= */

// Đọc giỏ hàng từ localStorage
function loadCart() {
    try {
        const savedCart = JSON.parse(
            localStorage.getItem(CART_STORAGE_KEY) || "{}"
        );

        if (
            savedCart &&
            typeof savedCart === "object" &&
            !Array.isArray(savedCart)
        ) {
            cart = savedCart;
        } else {
            cart = {};
        }

    } catch (error) {
        console.error("Không đọc được giỏ hàng:", error);
        cart = {};
    }
}

// Lưu giỏ hàng vào localStorage
function save() {
    try {
        localStorage.setItem(
            CART_STORAGE_KEY,
            JSON.stringify(cart)
        );
    } catch (error) {
        console.error("Không lưu được giỏ hàng:", error);
    }

    updateCount();
}

// Cập nhật số lượng sản phẩm trên nút giỏ hàng
function updateCount() {
    const totalQuantity = Object.values(cart).reduce(
        (total, quantity) => total + Number(quantity || 0),
        0
    );

    $("count").textContent = totalQuantity;
}


/* =========================================================
   4. TẢI SẢN PHẨM TỪ API RENDER
========================================================= */

async function loadProducts() {
    const grid = $("grid");

    grid.textContent = "Đang tải sản phẩm...";

    try {
        const response = await fetch(PRODUCTS_API);

        if (!response.ok) {
            throw new Error("Không tải được sản phẩm");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("Dữ liệu sản phẩm không hợp lệ");
        }

        products = data;

        renderFilters();
        renderProducts();
        renderCart();
        updateCount();

    } catch (error) {
        console.error("Lỗi tải sản phẩm:", error);

        grid.textContent = error.message;
    }
}


/* =========================================================
   5. QUẢN LÝ DANH MỤC SẢN PHẨM
========================================================= */

// Lấy danh sách danh mục từ sản phẩm
function getCategories() {
    const categories = products
        .map((product) => product.category)
        .filter(Boolean);

    return [
        "Tất cả",
        ...new Set(categories)
    ];
}

// Hiển thị các nút danh mục
function renderFilters() {
    const container = $("filters");

    container.replaceChildren();

    const categories = getCategories();

    categories.forEach((item) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "filter";
        button.textContent = item;

        if (category === item) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            setCategory(item);
        });

        container.appendChild(button);
    });
}

// Thay đổi danh mục đang chọn
function setCategory(selectedCategory) {
    category = selectedCategory;

    renderFilters();
    renderProducts();
}


/* =========================================================
   6. TÌM KIẾM VÀ LỌC SẢN PHẨM
========================================================= */

// Lọc sản phẩm theo danh mục và từ khóa
function getFilteredProducts() {
    const keyword = normalizeText($("search").value);

    return products.filter((product) => {
        const matchCategory =
            category === "Tất cả" ||
            product.category === category;

        const matchSearch = normalizeText(
            product.name
        ).includes(keyword);

        return matchCategory && matchSearch;
    });
}


/* =========================================================
   7. HIỂN THỊ SẢN PHẨM TRÊN CỬA HÀNG
========================================================= */

// Tạo hình ảnh sản phẩm
function createProductImage(product) {
    if (!product.image) {
        return "📦";
    }

    return `
        <img
            src="${escapeHTML(product.image)}"
            alt="${escapeHTML(product.name)}"
            loading="lazy"
            style="
                width: 100%;
                height: 100%;
                object-fit: contain;
            "
        >
    `;
}

// Tạo thẻ HTML cho một sản phẩm
function createProductCard(product) {
    const tag = product.tag
        ? `
            <span class="tag">
                ${escapeHTML(product.tag)}
            </span>
        `
        : "";

    return `
        <article class="product">

            <div class="visual">
                ${tag}
                ${createProductImage(product)}
            </div>

            <div class="info">

                <small>
                    ${escapeHTML(product.category)}
                </small>

                <h3>
                    ${escapeHTML(product.name)}
                </h3>

                <div class="price">
                    ${money(product.price)}
                </div>

                <button
                    class="add"
                    type="button"
                    data-add-id="${escapeHTML(product.id)}"
                >
                    + Thêm vào giỏ
                </button>

            </div>

        </article>
    `;
}

// Hiển thị toàn bộ sản phẩm
function renderProducts() {
    const filteredProducts = getFilteredProducts();

    $("resultCount").textContent =
        filteredProducts.length + " sản phẩm";

    const grid = $("grid");

    if (filteredProducts.length === 0) {
        grid.innerHTML = `
            <p>Không tìm thấy sản phẩm phù hợp.</p>
        `;

        return;
    }

    grid.innerHTML = filteredProducts
        .map(createProductCard)
        .join("");
}


/* =========================================================
   8. THÊM VÀ THAY ĐỔI SẢN PHẨM TRONG GIỎ HÀNG
========================================================= */

// Thêm sản phẩm vào giỏ
function add(id) {
    const product = products.find(
        (item) => String(item.id) === String(id)
    );

    if (!product) {
        alert("Sản phẩm không tồn tại.");
        return;
    }

    const key = String(product.id);

    cart[key] = Number(cart[key] || 0) + 1;

    save();
    renderCart();
}

// Tăng hoặc giảm số lượng
function change(id, delta) {
    const key = String(id);

    if (!cart[key]) {
        return;
    }

    cart[key] = Number(cart[key]) + delta;

    if (cart[key] <= 0) {
        delete cart[key];
    }

    save();
    renderCart();
}


/* =========================================================
   9. HIỂN THỊ GIỎ HÀNG
========================================================= */

// Lấy các sản phẩm đang có trong giỏ
function getCartProducts() {
    return products.filter(
        (product) => Number(cart[product.id]) > 0
    );
}

// Tạo HTML một dòng sản phẩm trong giỏ
function createCartItem(product) {
    const quantity = Number(cart[product.id]);

    return `
        <div class="cart-row">

            <div class="thumb">
                ${createProductImage(product)}
            </div>

            <div class="cart-meta">

                <strong>
                    ${escapeHTML(product.name)}
                </strong>

                <small>
                    ${money(product.price)}
                </small>

                <div class="qty">

                    <button
                        type="button"
                        data-change-id="${escapeHTML(product.id)}"
                        data-delta="-1"
                    >
                        −
                    </button>

                    <span>${quantity}</span>

                    <button
                        type="button"
                        data-change-id="${escapeHTML(product.id)}"
                        data-delta="1"
                    >
                        +
                    </button>

                </div>

            </div>

            <b>
                ${money(Number(product.price) * quantity)}
            </b>

        </div>
    `;
}

// Tính tổng tiền giỏ hàng
function getCartTotal(items) {
    return items.reduce((total, product) => {
        const quantity = Number(cart[product.id] || 0);

        return total + Number(product.price) * quantity;
    }, 0);
}

// Hiển thị giỏ hàng
function renderCart() {
    const items = getCartProducts();

    const container = $("cartItems");

    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty">
                Giỏ hàng đang trống 🛒
            </div>
        `;
    } else {
        container.innerHTML = items
            .map(createCartItem)
            .join("");
    }

    $("total").textContent = money(
        getCartTotal(items)
    );
}


/* =========================================================
   10. MỞ VÀ ĐÓNG GIỎ HÀNG / THANH TOÁN
========================================================= */

// Mở giỏ hàng
function openCart() {
    renderCart();

    $("drawer").classList.add("open");
}

// Đóng giỏ hàng
function closeCart() {
    $("drawer").classList.remove("open");
}

// Mở form thanh toán
function checkout() {
    if (getCartProducts().length === 0) {
        alert("Vui lòng thêm sản phẩm vào giỏ hàng.");
        return;
    }

    closeCart();

    $("modal").classList.add("open");
}

// Đóng form thanh toán
function closeModal() {
    $("modal").classList.remove("open");
}


/* =========================================================
   11. XỬ LÝ ĐẶT HÀNG DEMO
========================================================= */

// Lưu đơn hàng trên trình duyệt
function saveOrder(order) {
    let orders = [];

    try {
        orders = JSON.parse(
            localStorage.getItem(ORDER_STORAGE_KEY) || "[]"
        );

        if (!Array.isArray(orders)) {
            orders = [];
        }

    } catch (error) {
        orders = [];
    }

    orders.push(order);

    localStorage.setItem(
        ORDER_STORAGE_KEY,
        JSON.stringify(orders)
    );
}

// Xử lý khi khách xác nhận đơn hàng
function handleOrderSubmit(event) {
    event.preventDefault();

    const form = event.target;

    const order = {
        id: "BC3D-" + Date.now(),

        items: {
            ...cart
        },

        customer: Object.fromEntries(
            new FormData(form)
        ),

        createdAt: new Date().toISOString()
    };

    try {
        saveOrder(order);

    } catch (error) {
        alert("Không thể lưu đơn hàng. Vui lòng thử lại.");
        return;
    }

    // Xóa giỏ hàng sau khi lưu đơn
    cart = {};

    save();
    renderCart();
    closeModal();

    form.reset();

    alert(
        "Đã tạo đơn hàng" +
        order.id +
        ". Đơn hàng đã được gửi đến cửa hàng."
    );
}


/* =========================================================
   12. KHỞI TẠO VÀ GẮN SỰ KIỆN
========================================================= */

function initializeShop() {

    // Đọc giỏ hàng đã lưu
    loadCart();

    // Tìm kiếm sản phẩm
    $("search").addEventListener(
        "input",
        renderProducts
    );

    // Xử lý thêm sản phẩm vào giỏ
    $("grid").addEventListener("click", (event) => {
        const button = event.target.closest("[data-add-id]");

        if (!button) {
            return;
        }

        add(button.dataset.addId);
    });

    // Xử lý tăng giảm số lượng trong giỏ
    $("cartItems").addEventListener("click", (event) => {
        const button = event.target.closest("[data-change-id]");

        if (!button) {
            return;
        }

        change(
            button.dataset.changeId,
            Number(button.dataset.delta)
        );
    });

    // Xử lý xác nhận đặt hàng
    $("orderForm").addEventListener(
        "submit",
        handleOrderSubmit
    );

    // Cập nhật số lượng giỏ hàng
    updateCount();

    // Lấy sản phẩm từ máy chủ
    loadProducts();
}

// Chạy khi trang HTML đã sẵn sàng
if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeShop
    );
} else {
    initializeShop();
}
