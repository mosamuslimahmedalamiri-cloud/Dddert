import os
import logging
import sqlite3
import random
import string
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes, MessageHandler, filters
from dotenv import load_dotenv

load_dotenv()

# ===== بيانات البوت =====
TOKEN = "8933408374:AAFBvrSI_XG8q_x_jNbNNOpbTRjfDRyjX2s"
BOT_USERNAME = "Tes12tyebot"
ADMIN_ID = "26757714"

# ===== إعدادات =====
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    level=logging.INFO)

# ===== قاعدة البيانات =====
def init_db():
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    
    # جدول المستخدمين
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            full_name TEXT,
            referral_code TEXT UNIQUE,
            referred_by TEXT,
            referral_count INTEGER DEFAULT 0,
            points INTEGER DEFAULT 0,
            total_earned INTEGER DEFAULT 0,
            join_date TEXT
        )
    ''')
    
    # جدول طلبات السحب
    c.execute('''
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            amount INTEGER,
            status TEXT DEFAULT 'pending',
            request_date TEXT,
            processed_date TEXT
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ قاعدة البيانات جاهزة")

# ===== دوال مساعدة =====
def generate_referral_code():
    letters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(letters) for _ in range(6))

def get_user(user_id, username, full_name, referred_by=None):
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
    user = c.fetchone()
    
    if not user:
        referral_code = generate_referral_code()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        c.execute('''
            INSERT INTO users (user_id, username, full_name, referral_code, referred_by, join_date)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (user_id, username, full_name, referral_code, referred_by, now))
        
        # مكافأة المدعو
        if referred_by:
            c.execute('UPDATE users SET points = points + 50, referral_count = referral_count + 1 WHERE user_id = ?', (referred_by,))
            c.execute('UPDATE users SET total_earned = total_earned + 50 WHERE user_id = ?', (referred_by,))
        
        conn.commit()
        conn.close()
        return True, referral_code
    
    conn.close()
    return False, None

def get_user_data(user_id):
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    c.execute('SELECT referral_count, points, total_earned, referral_code FROM users WHERE user_id = ?', (user_id,))
    result = c.fetchone()
    conn.close()
    return result if result else (0, 0, 0, None)

def get_user_by_referral_code(code):
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    c.execute('SELECT user_id FROM users WHERE referral_code = ?', (code,))
    result = c.fetchone()
    conn.close()
    return result[0] if result else None

def get_leaderboard():
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    c.execute('''
        SELECT username, full_name, referral_count, total_earned FROM users
        ORDER BY total_earned DESC
        LIMIT 10
    ''')
    result = c.fetchall()
    conn.close()
    return result

def add_withdrawal_request(user_id, amount):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    c.execute('''
        INSERT INTO withdrawals (user_id, amount, request_date)
        VALUES (?, ?, ?)
    ''', (user_id, amount, now))
    conn.commit()
    conn.close()

def get_withdrawal_requests():
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    c.execute('''
        SELECT id, user_id, amount, request_date FROM withdrawals
        WHERE status = 'pending'
        ORDER BY request_date ASC
    ''')
    result = c.fetchall()
    conn.close()
    return result

def process_withdrawal(withdrawal_id, status):
    conn = sqlite3.connect("referral_bot.db")
    c = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute('''
        UPDATE withdrawals SET status = ?, processed_date = ?
        WHERE id = ?
    ''', (status, now, withdrawal_id))
    
    if status == 'approved':
        # خصم النقاط من المستخدم
        c.execute('''
            SELECT user_id, amount FROM withdrawals WHERE id = ?
        ''', (withdrawal_id,))
        user_id, amount = c.fetchone()
        c.execute('UPDATE users SET points = points - ? WHERE user_id = ?', (amount, user_id))
    
    conn.commit()
    conn.close()

# ===== دالة إنشاء الأزرار =====
def glass_button(text, callback_data, emoji="✨"):
    return InlineKeyboardButton(text=f"{emoji} {text}", callback_data=callback_data)

def back_button(callback_data="menu_back"):
    return InlineKeyboardButton(text="🔙 رجوع", callback_data=callback_data)

# ===== القوائم =====
def main_menu_keyboard():
    keyboard = [
        [glass_button("💰 أرباحي", "menu_earnings", "💵")],
        [glass_button("🔗 رابط الدعوة", "menu_referral", "📤")],
        [glass_button("👥 المدعوين", "menu_referrals", "👥")],
        [glass_button("🏆 المتصدرين", "menu_leaderboard", "🏆")],
        [glass_button("💳 طلب سحب", "menu_withdraw", "💳")],
    ]
    if ADMIN_ID:
        keyboard.append([glass_button("⚙️ لوحة المدير", "menu_admin", "👑")])
    return InlineKeyboardMarkup(keyboard)

def admin_keyboard():
    keyboard = [
        [glass_button("📊 طلبات السحب", "admin_withdrawals", "📋")],
        [glass_button("👥 إحصائيات المستخدمين", "admin_stats", "📊")],
        [glass_button("📢 إرسال إشعار", "admin_broadcast", "📢")],
        [back_button("menu_back")]
    ]
    return InlineKeyboardMarkup(keyboard)

# ===== الأوامر =====
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_id = str(user.id)
    username = user.username or "بدون معرف"
    full_name = user.full_name or "موظف"
    
    referred_by = None
    if context.args:
        code = context.args[0]
        referred_by = get_user_by_referral_code(code)
    
    is_new, referral_code = get_user(user_id, username, full_name, referred_by)
    
    if is_new and referred_by:
        text = (
            "🎉 **مرحباً بك في بوت الربح من المشاركة!**\n\n"
            "🌟 تم تسجيلك عن طريق دعوة من صديق!\n"
            f"🎁 صديقك حصل على 50 نقطة!\n\n"
            "💡 **ابدأ الآن بمشاركة رابطك الخاص!**"
        )
    else:
        referral_count, points, total_earned, _ = get_user_data(user_id)
        text = (
            "💰 **بوت الربح من المشاركة** 💰\n\n"
            f"💵 **إجمالي أرباحك:** {total_earned} نقطة\n"
            f"⭐ **نقاطك الحالية:** {points} نقطة\n"
            f"👥 **عدد المدعوين:** {referral_count}\n"
            "───────────────────\n"
            "💡 **اختر من القائمة أدناه:**"
        )
    
    await update.message.reply_text(
        text,
        reply_markup=main_menu_keyboard(),
        parse_mode="Markdown"
    )

# ===== عرض الأرباح =====
async def show_earnings(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = str(query.from_user.id)
    referral_count, points, total_earned, referral_code = get_user_data(user_id)
    
    text = (
        "💰 **أرباحي**\n\n"
        f"💵 **إجمالي الأرباح:** {total_earned} نقطة\n"
        f"⭐ **النقاط المتاحة:** {points} نقطة\n"
        f"👥 **عدد المدعوين:** {referral_count}\n\n"
        "📌 **نظام الأرباح:**\n"
        "└ كل مدعو جديد: +50 نقطة\n"
        "└ الحد الأدنى للسحب: 100 نقطة\n"
        "└ المكافآت الأسبوعية: نقاط إضافية"
    )
    
    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([[back_button("menu_back")]]),
        parse_mode="Markdown"
    )

# ===== عرض رابط الدعوة =====
async def show_referral(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = str(query.from_user.id)
    referral_count, points, total_earned, referral_code = get_user_data(user_id)
    
    bot_username = BOT_USERNAME.replace('@', '')
    referral_link = f"https://t.me/{bot_username}?start={referral_code}"
    
    text = (
        "🔗 **رابط الدعوة الخاص بك**\n\n"
        f"`{referral_link}`\n\n"
        f"👥 عدد المدعوين: {referral_count}\n"
        f"💰 الأرباح: {total_earned} نقطة\n\n"
        "📤 شارك الرابط مع أصدقائك واحصل على 50 نقطة لكل مدعو!"
    )
    
    keyboard = [
        [
            InlineKeyboardButton("📋 نسخ الرابط", callback_data="copy_link"),
            InlineKeyboardButton("📤 مشاركة", callback_data="share_link")
        ],
        [back_button("menu_back")]
    ]
    
    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown"
    )

# ===== عرض المدعوين =====
async def show_referrals(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    text = (
        "👥 **قائمة المدعوين**\n\n"
        "📌 سيتم عرض المدعوين قريباً..."
    )
    
    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([[back_button("menu_back")]]),
        parse_mode="Markdown"
    )

# ===== عرض المتصدرين =====
async def show_leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    users = get_leaderboard()
    
    if not users:
        text = "📭 **لا يوجد متصدرين بعد**\n\nكن أول من يشارك رابط الدعوة!"
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup([[back_button("menu_back")]]),
            parse_mode="Markdown"
        )
        return
    
    text = "🏆 **🏅 ترتيب المتصدرين**\n\n"
    medals = ["🥇", "🥈", "🥉"]
    
    for i, (username, full_name, referral_count, total_earned) in enumerate(users, 1):
        medal = medals[i-1] if i <= 3 else f"{i}."
        text += f"{medal} {full_name or username}\n"
        text += f"└ 👥 {referral_count} مدعو - 💰 {total_earned} نقطة\n\n"
    
    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([[back_button("menu_back")]]),
        parse_mode="Markdown"
    )

# ===== طلب السحب =====
async def request_withdrawal(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = str(query.from_user.id)
    _, points, _, _ = get_user_data(user_id)
    
    if points < 100:
        text = (
            "❌ **لا يمكنك طلب السحب**\n\n"
            f"⭐ نقاطك الحالية: {points}\n"
            "⚠️ الحد الأدنى للسحب هو 100 نقطة\n\n"
            "📌 ادعُ المزيد من الأصدقاء لجمع النقاط!"
        )
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup([[back_button("menu_back")]]),
            parse_mode="Markdown"
        )
        return
    
    # إضافة طلب سحب
    add_withdrawal_request(user_id, points)
    
    text = (
        "✅ **تم تقديم طلب السحب بنجاح!**\n\n"
        f"💰 المبلغ المطلوب: {points} نقطة\n"
        "📊 سيتم معالجة الطلب خلال 24 ساعة\n\n"
        "📌 سيتم إشعارك عند الموافقة على الطلب."
    )
    
    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([[back_button("menu_back")]]),
        parse_mode="Markdown"
    )

# ===== لوحة المدير =====
async def admin_panel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = str(query.from_user.id)
    
    if user_id != ADMIN_ID:
        text = "❌ **غير مصرح لك!**\n\nهذه اللوحة خاصة بالمدير فقط."
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup([[back_button("menu_back")]]),
            parse_mode="Markdown"
        )
        return
    
    text = (
        "👑 **⚙️ لوحة تحكم المدير**\n\n"
        "✨ **مرحباً بك في لوحة التحكم**\n"
        "───────────────────\n"
        "🔹 **إدارة طلبات السحب**\n"
        "🔹 **إحصائيات المستخدمين**\n"
        "🔹 **إرسال إشعارات**\n"
        "───────────────────\n"
        "👇 اختر الإجراء المناسب:"
    )
    
    await query.edit_message_text(
        text,
        reply_markup=admin_keyboard(),
        parse_mode="Markdown"
    )

# ===== إدارة طلبات السحب =====
async def admin_withdrawals(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = str(query.from_user.id)
    
    if user_id != ADMIN_ID:
        return
    
    requests = get_withdrawal_requests()
    
    if not requests:
        text = "📭 **لا توجد طلبات سحب معلقة**"
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup([[back_button("admin_back")]]),
            parse_mode="Markdown"
        )
        return
    
    text = "📋 **📊 طلبات السحب المعلقة**\n\n"
    for req_id, user, amount, date in requests:
        text += f"🆔 طلب #{req_id}\n"
        text += f"└ 👤 المستخدم: {user}\n"
        text += f"└ 💰 المبلغ: {amount} نقطة\n"
        text += f"└ 📅 التاريخ: {date[:16]}\n"
        text += f"└ ✅ /approve_{req_id} أو ❌ /reject_{req_id}\n\n"
    
    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([[back_button("admin_back")]]),
        parse_mode="Markdown"
    )

# ===== معالجة طلبات السحب =====
async def handle_withdrawal_decision(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    
    if user_id != ADMIN_ID:
        return
    
    text = update.message.text
    parts = text.split('_')
    
    if len(parts) != 2:
        return
    
    action = parts[0].replace('/', '')
    withdrawal_id = int(parts[1])
    
    if action == 'approve':
        process_withdrawal(withdrawal_id, 'approved')
        await update.message.reply_text(f"✅ تم الموافقة على الطلب #{withdrawal_id}")
    elif action == 'reject':
        process_withdrawal(withdrawal_id, 'rejected')
        await update.message.reply_text(f"❌ تم رفض الطلب #{withdrawal_id}")

# ===== معالجة نسخ الرابط =====
async def copy_link_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer("📋 تم نسخ الرابط!", show_alert=True)

# ===== معالجة مشاركة الرابط =====
async def share_link_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = str(query.from_user.id)
    _, _, _, referral_code = get_user_data(user_id)
    bot_username = BOT_USERNAME.replace('@', '')
    referral_link = f"https://t.me/{bot_username}?start={referral_code}"
    
    text = (
        "📤 **مشاركة رابط الدعوة**\n\n"
        "انسخ الرابط وأرسله لأصدقائك:\n\n"
        f"`{referral_link}`\n\n"
        "🎁 **مكافأة الدعوة:** 50 نقطة لكل مدعو!"
    )
    
    await query.edit_message_text(
        text,
        reply_markup=InlineKeyboardMarkup([[back_button("menu_referral")]]),
        parse_mode="Markdown"
    )

# ===== معالجة القائمة الرئيسية =====
async def menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    action = query.data.replace("menu_", "")
    
    if action == "earnings":
        await show_earnings(update, context)
    
    elif action == "referral":
        await show_referral(update, context)
    
    elif action == "referrals":
        await show_referrals(update, context)
    
    elif action == "leaderboard":
        await show_leaderboard(update, context)
    
    elif action == "withdraw":
        await request_withdrawal(update, context)
    
    elif action == "admin":
        await admin_panel(update, context)
    
    elif action == "back":
        user_id = str(query.from_user.id)
        referral_count, points, total_earned, _ = get_user_data(user_id)
        text = (
            "💰 **بوت الربح من المشاركة** 💰\n\n"
            f"💵 **إجمالي أرباحك:** {total_earned} نقطة\n"
            f"⭐ **نقاطك الحالية:** {points} نقطة\n"
            f"👥 **عدد المدعوين:** {referral_count}\n"
            "───────────────────\n"
            "💡 **اختر من القائمة أدناه:**"
        )
        await query.edit_message_text(
            text,
            reply_markup=main_menu_keyboard(),
            parse_mode="Markdown"
        )

# ===== معالجة لوحة المدير =====
async def admin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    user_id = str(query.from_user.id)
    
    if user_id != ADMIN_ID:
        return
    
    action = query.data.replace("admin_", "")
    
    if action == "withdrawals":
        await admin_withdrawals(update, context)
    
    elif action == "stats":
        # إحصائيات المستخدمين
        text = "📊 **إحصائيات المستخدمين**\n\n"
        text += "سيتم عرض الإحصائيات قريباً..."
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup([[back_button("admin_back")]]),
            parse_mode="Markdown"
        )
    
    elif action == "broadcast":
        text = (
            "📢 **إرسال إشعار**\n\n"
            "أرسل رسالة وسيتم إرسالها لجميع المستخدمين."
        )
        await query.edit_message_text(
            text,
            reply_markup=InlineKeyboardMarkup([[back_button("admin_back")]]),
            parse_mode="Markdown"
        )
        context.user_data['admin_action'] = 'broadcast'
    
    elif action == "back":
        await admin_panel(update, context)

# ===== التشغيل =====
def main():
    if not TOKEN:
        print("❌ اكتب التوكن في ملف .env")
        return
    
    init_db()
    
    app = Application.builder().token(TOKEN).build()
    
    # الأوامر
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("approve", handle_withdrawal_decision))
    app.add_handler(CommandHandler("reject", handle_withdrawal_decision))
    
    # معالجة الأزرار
    app.add_handler(CallbackQueryHandler(menu_callback, pattern="^menu_"))
    app.add_handler(CallbackQueryHandler(admin_callback, pattern="^admin_"))
    app.add_handler(CallbackQueryHandler(copy_link_callback, pattern="^copy_link$"))
    app.add_handler(CallbackQueryHandler(share_link_callback, pattern="^share_link$"))
    
    print("✅ بوت الربح من المشاركة شغال... 🚀")
    print("👑 المدير:", ADMIN_ID)
    print("🔗 معرف البوت:", BOT_USERNAME)
    app.run_polling()

if __name__ == "__main__":
    main()
