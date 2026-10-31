import express from 'express';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const app=express();
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
app.use(express.json({ limit: "16mb" }));



/* =========================================================
   TELEGRAM - NHẬN THÔNG BÁO ĐƠN HÀNG
========================================================= */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Giới hạn kích thước và độ dài thông tin
const MAX_ORDER_ITEMS = 50;

function cleanOrderText(value, maxLength = 300) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function formatVND(value) {
    return Number(value).toLocaleString("vi-VN") + "đ";
}

function escapeTelegramHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

async function sendTelegramOrder(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        throw new Error("Chưa cấu hình Telegram trên Render");
    }

    const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: "HTML"
            }),
            signal: AbortSignal.timeout(10000)
        }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
        throw new Error(
            result.description || "Telegram không nhận được thông báo"
        );
    }

    return result;
}

/* =========================================================
   API - KHÁCH XÁC NHẬN ĐƠN HÀNG
========================================================= */

app.post("/api/orders", async (req, res) => {
    try {
        const { customer, items } = req.body || {};

        // 1. Kiểm tra thông tin khách hàng
        const name = cleanOrderText(customer?.name, 120);
        const phone = cleanOrderText(customer?.phone, 20);
        const address = cleanOrderText(customer?.address, 500);

        if (!name || !phone || !address) {
            return res.status(400).json({
                error: "Vui lòng nhập đầy đủ thông tin giao hàng"
            });
        }

        if (!/^[0-9+ .()-]{9,18}$/.test(phone)) {
            return res.status(400).json({
                error: "Số điện thoại không hợp lệ"
            });
        }

        // 2. Kiểm tra danh sách sản phẩm
        if (
            !Array.isArray(items) ||
            items.length === 0 ||
            items.length > MAX_ORDER_ITEMS
        ) {
            return res.status(400).json({
                error: "Giỏ hàng không hợp lệ"
            });
        }

        // 3. Lấy giá sản phẩm từ PostgreSQL
        // Không tin giá do trình duyệt gửi lên.
        const ids = [];
        const quantities = new Map();

        for (const item of items) {
            const id = String(item.id ?? "");
            const quantity = Number(item.quantity);

            if (
                !id ||
                id.length > 100 ||
                !Number.isSafeInteger(quantity) ||
                quantity < 1 ||
                quantity > 100
            ) {
                return res.status(400).json({
                    error: "Sản phẩm hoặc số lượng không hợp lệ"
                });
            }

            if (!quantities.has(id)) {
                ids.push(id);
                quantities.set(id, quantity);
            } else {
                return res.status(400).json({
                    error: "Sản phẩm bị trùng trong giỏ hàng"
                });
            }
        }

        /*
         * LƯU Ý:
         * Ví dụ này giả định server.js đã có biến `pool`
         * kết nối PostgreSQL bằng thư viện pg.
         *
         * Bảng products có các cột:
         * id, name, price, stock.
         *
         * Nếu server của bạn đặt tên khác,
         * cần sửa câu truy vấn bên dưới.
         */

        const queryResult = await db.query(
            `
                SELECT id, name, price, stock
                FROM products
                WHERE id::text = ANY($1::text[])
            `,
            [ids]
        );

        if (queryResult.rows.length !== ids.length) {
            return res.status(400).json({
                error: "Một số sản phẩm không còn tồn tại"
            });
        }

        const productMap = new Map(
            queryResult.rows.map((product) => [
                String(product.id),
                product
            ])
        );

        let total = 0;
        const orderLines = [];

        for (const id of ids) {
            const product = productMap.get(id);
            const quantity = quantities.get(id);


/* =========================================================
   KIỂM TRA GIÁ BÁN VÀ SỐ LƯỢNG TỒN KHO
========================================================= */

const price = Number(product.price);
const stock = Number(product.stock);

// Kiểm tra giá sản phẩm
if (
    !Number.isFinite(price) ||
    price < 0
) {
    return res.status(400).json({
        error: `Giá sản phẩm "${product.name}" không hợp lệ`
    });
}

// Kiểm tra dữ liệu tồn kho
if (
    !Number.isInteger(stock) ||
    stock < 0
) {
    return res.status(400).json({
        error: `Dữ liệu tồn kho của "${product.name}" không hợp lệ`
    });
}

// Kiểm tra số lượng khách đặt
if (stock < quantity) {
    return res.status(400).json({
        error:
            `Sản phẩm "${product.name}" chỉ còn ${stock} sản phẩm. ` +
            `Bạn đang đặt ${quantity} sản phẩm.`
    });
}


            const subtotal = price * quantity;

            total += subtotal;

            orderLines.push(
                `• ${escapeTelegramHTML(product.name)}\n` +
                `  SL: ${quantity} × ${formatVND(price)}\n` +
                `  Thành tiền: ${formatVND(subtotal)}`
            );
        }

        if (!Number.isSafeInteger(total)) {
            return res.status(400).json({
                error: "Tổng tiền không hợp lệ"
            });
        }

        // 4. Tạo mã đơn hàng
        const orderId =
            "Yvy-" +
            Date.now() +
            "-" +
            Math.random().toString(36).slice(2, 8).toUpperCase();

        const createdAt = new Date();

        // 5. Tạo nội dung Telegram
        const message = [
            "🛒 <b>ĐƠN HÀNG MỚI - Yvy Shop</b>",
            "",
            `🆔 Mã đơn: <code>${orderId}</code>`,
            `🕒 Thời gian: ${createdAt.toLocaleString("vi-VN", {
                timeZone: "Asia/Ho_Chi_Minh"
            })}`,
            "",
            "👤 <b>THÔNG TIN KHÁCH HÀNG</b>",
            `Họ và tên: ${escapeTelegramHTML(name)}`,
            `SĐT: ${escapeTelegramHTML(phone)}`,
            `Địa chỉ: ${escapeTelegramHTML(address)}`,
            "",
            "📦 <b>SẢN PHẨM ĐẶT MUA</b>",
            ...orderLines,
            "",
            `💰 <b>TỔNG TIỀN: ${formatVND(total)}</b>`,
            "💵 Thanh toán: COD",
            "",
            "📌 Vui lòng liên hệ khách để xác nhận."
        ].join("\n");

        // 6. Gửi Telegram
        await sendTelegramOrder(message);

        // 7. Trả kết quả thành công
        return res.status(201).json({
            success: true,
            orderId,
            total,
            message: "Đơn hàng đã được gửi đến cửa hàng"
        });

    } catch (error) {
        console.error("Lỗi gửi đơn hàng:", error);

        return res.status(502).json({
            error: "Chưa thể gửi đơn hàng. Vui lòng thử lại."
        });
    }
});



const {DATABASE_URL,ADMIN_PASSWORD}=process.env;
if(!DATABASE_URL||!ADMIN_PASSWORD){console.error('Missing DATABASE_URL or ADMIN_PASSWORD');process.exit(1)}
const db=new pg.Pool({connectionString:DATABASE_URL,ssl:DATABASE_URL.includes('localhost')?false:{rejectUnauthorized:false}});
await db.query('CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, price NUMERIC NOT NULL, category TEXT NOT NULL, stock INTEGER NOT NULL, description TEXT NOT NULL DEFAULT \'\', image TEXT NOT NULL DEFAULT \'\', created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
await db.query(`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb
`);
const auth=(req,res,next)=>{const supplied=req.get('x-admin-password')||'';const a=Buffer.from(supplied),b=Buffer.from(ADMIN_PASSWORD);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:'Sai mật khẩu Admin'});next()};

const format = (r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    category: r.category,
    stock: r.stock,
    description: r.description,
    image: r.image,
    images: Array.isArray(r.images) && r.images.length
        ? r.images
        : r.image ? [r.image] : []
});

app.get('/api/products',async(req,res)=>{try{const r=await db.query('SELECT * FROM products ORDER BY created_at DESC');res.json(r.rows.map(format))}catch(e){console.error(e);res.status(500).json({error:'Không tải được sản phẩm'})}});

function validate(p) {
    if (
        !p ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        p.name.length > 120 ||
        !Number.isFinite(p.price) ||
        p.price < 0 ||
        typeof p.category !== "string" ||
        p.category.length > 80 ||
        !Number.isInteger(p.stock) ||
        p.stock < 0 ||
        typeof (p.description || "") !== "string" ||
        (p.description || "").length > 2000
    ) {
        return false;
    }

    const images = p.images === undefined
        ? (p.image ? [p.image] : [])
        : p.images;


return Array.isArray(images) &&
    images.length <= 5 &&
    images.every(img => {
        if (typeof img !== "string") return false;

        const match = img.match(
            /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/
        );

        if (!match) return false;

        const base64 = match[2];

        if (base64.length % 4 !== 0) return false;

        const padding = (base64.match(/=+$/) || [""])[0].length;

        const bytes = base64.length * 3 / 4 - padding;

        return bytes <= 2.5 * 1024 * 1024;
    });

}




app.post("/api/products", auth, async (req, res) => {
    const p = req.body;

    if (!validate(p)) {
        return res.status(400).json({
            error: "Dữ liệu hoặc hình ảnh không hợp lệ. Tối đa 5 ảnh."
        });
    }

    try {
        const id = crypto.randomUUID();
        const images = p.images ?? (p.image ? [p.image] : []);
        const image = images[0] || "";

        await db.query(`
            INSERT INTO products
            (id, name, price, category, stock, description, image, images)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        `, [
            id,
            p.name.trim(),
            p.price,
            p.category,
            p.stock,
            p.description || "",
            image,
            JSON.stringify(images)
        ]);

        res.status(201).json({ id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Không lưu được sản phẩm" });
    }
});


app.put("/api/products/:id", auth, async (req, res) => {
    const p = req.body;

    if (!validate(p)) {
        return res.status(400).json({
            error: "Dữ liệu hoặc hình ảnh không hợp lệ."
        });
    }

    try {
        const images = p.images ?? (p.image ? [p.image] : []);
        const image = images[0] || "";

        const result = await db.query(`
            UPDATE products SET
                name = $1,
                price = $2,
                category = $3,
                stock = $4,
                description = $5,
                image = $6,
                images = $7::jsonb
            WHERE id = $8
            RETURNING id
        `, [
            p.name.trim(),
            p.price,
            p.category,
            p.stock,
            p.description || "",
            image,
            JSON.stringify(images),
            req.params.id
        ]);

        if (!result.rowCount) {
            return res.status(404).json({
                error: "Không tìm thấy sản phẩm"
            });
        }

        res.json({ ok: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Không cập nhật được sản phẩm"
        });
    }
});


app.delete('/api/products/:id',auth,async(req,res)=>{try{await db.query('DELETE FROM products WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){console.error(e);res.status(500).json({error:'Không xóa được'})}});
app.use(express.static(root));app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Shop3D running'));
