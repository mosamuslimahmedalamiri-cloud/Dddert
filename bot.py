"""
بوت الألعاب الترفيهي - كود متكامل مصحح
المطور: @BB_03
نسخة آمنة للرفع
"""
import asyncio
import logging
import sqlite3
import os
import random
from datetime import datetime
from contextlib import contextmanager
from typing import Dict, List, Optional

from aiogram import Bot, Dispatcher, types
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup,
    InlineKeyboardButton, CallbackQuery, Message
)

# ==================== التكوين الآمن ====================
class Config:
    BOT_TOKEN = os.getenv("BOT_TOKEN", "ضع_التوكن_هنا")
    ADMIN_IDS = [int(x) for x in os.getenv("ADMIN_IDS", "26757714").split(",") if x.strip().isdigit()]
    REQUIRED_CHANNEL = os.getenv("REQUIRED_CHANNEL", "@BB_03")
    DATABASE_FILE = "games.db"

config = Config()

# ==================== قاعدة البيانات ====================
class Database:
    def __init__(self, db_file: str):
        self.db_file = db_file
        self.init_db()
    
    @contextmanager
    def get_connection(self):
        conn = sqlite3.connect(self.db_file)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
    
    def init_db(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id INTEGER UNIQUE NOT NULL,
                    username TEXT,
                    first_name TEXT NOT NULL,
                    last_name TEXT,
                    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    points INTEGER DEFAULT 20,
                    wins INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    games_played INTEGER DEFAULT 0,
                    is_blocked BOOLEAN DEFAULT 0,
                    is_admin BOOLEAN DEFAULT 0,
                    daily_bonus_date TIMESTAMP
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS games (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    game_type TEXT NOT NULL,
                    bet INTEGER NOT NULL,
                    result TEXT,
                    win BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            for admin_id in config.ADMIN_IDS:
                cursor.execute("INSERT OR IGNORE INTO users (telegram_id, first_name, is_admin, points) VALUES (?, ?, ?, ?)", (admin_id, "Admin", 1, 1000))
            conn.commit()
    
    def get_user(self, telegram_id: int) -> Optional[Dict]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE telegram_id = ?', (telegram_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def get_or_create_user(self, telegram_id: int, username: str = None, first_name: str = None, last_name: str = None) -> Dict:
        user = self.get_user(telegram_id)
        if not user:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('INSERT INTO users (telegram_id, username, first_name, last_name) VALUES (?, ?, ?, ?)', (telegram_id, username, first_name or "مستخدم", last_name))
                conn.commit()
                user = self.get_user(telegram_id)
        return user
    
    def update_user_stats(self, telegram_id: int, win: bool, points_change: int = 0):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE users SET wins = wins + ?, losses = losses + ?, games_played = games_played + 1, last_active = CURRENT_TIMESTAMP WHERE telegram_id = ?', (1 if win else 0, 0 if win else 1, telegram_id))
            conn.commit()
    
    def add_points(self, telegram_id: int, points: int) -> bool:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE users SET points = points + ? WHERE telegram_id = ?', (points, telegram_id))
            conn.commit()
            return cursor.rowcount > 0

    def set_points(self, telegram_id: int, points: int) -> bool:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE users SET points = ? WHERE telegram_id = ?', (points, telegram_id))
            conn.commit()
            return cursor.rowcount > 0
    
    def deduct_points(self, telegram_id: int, points: int) -> bool:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE users SET points = points - ? WHERE telegram_id = ? AND points >= ?', (points, telegram_id, points))
            conn.commit()
            return cursor.rowcount > 0
    
    def get_top_players(self, limit: int = 10) -> List[Dict]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT telegram_id, first_name, username, points, wins, games_played FROM users WHERE is_blocked = 0 ORDER BY points DESC LIMIT ?', (limit,))
            return [dict(row) for row in cursor.fetchall()]
    
    def get_total_users(self) -> int:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) as count FROM users WHERE is_blocked = 0')
            return cursor.fetchone()['count']
    
    def get_today_users(self) -> int:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(DISTINCT user_id) as count FROM games WHERE date(created_at) = date('now')")
            return cursor.fetchone()['count']
    
    def get_all_users(self) -> List[Dict]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT telegram_id FROM users WHERE is_blocked = 0')
            return [dict(row) for row in cursor.fetchall()]
    
    def block_user(self, telegram_id: int):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE users SET is_blocked = 1 WHERE telegram_id = ?', (telegram_id,))
            conn.commit()
    
    def unblock_user(self, telegram_id: int):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE users SET is_blocked = 0 WHERE telegram_id = ?', (telegram_id,))
            conn.commit()

    def log_game(self, user_id, game_type, bet, win):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('INSERT INTO games (user_id, game_type, bet, win) VALUES (?,?,?,?)', (user_id, game_type, bet, 1 if win else 0))
            conn.commit()

db = Database(config.DATABASE_FILE)
storage = MemoryStorage()
bot = Bot(token=config.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher(storage=storage)

class GameStates(StatesGroup):
    ROULETTE_BET = State()
    SLOTS_BET = State()
    DICE_BET = State()
    CARD_GAME = State()
    GUESS_BET = State()
    GUESS_NUMBER = State()

class AdminStates(StatesGroup):
    BROADCAST = State()

def get_main_keyboard():
    return ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text="🎰 الألعاب")],[KeyboardButton(text="💰 رصيدي"), KeyboardButton(text="🏆 المتصدرين")],[KeyboardButton(text="🎁 المكافأة اليومية"), KeyboardButton(text="📊 إحصائياتي")],[KeyboardButton(text="📞 الدعم الفني"), KeyboardButton(text="ℹ️ عن البوت")]], resize_keyboard=True)

def get_admin_main_keyboard():
    return ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text="🎰 الألعاب")],[KeyboardButton(text="💰 رصيدي"), KeyboardButton(text="🏆 المتصدرين")],[KeyboardButton(text="🎁 المكافأة اليومية"), KeyboardButton(text="📊 إحصائياتي")],[KeyboardButton(text="📞 الدعم الفني"), KeyboardButton(text="ℹ️ عن البوت")],[KeyboardButton(text="🔐 لوحة الإدارة")]], resize_keyboard=True)

def get_admin_keyboard():
    return ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text="👤 المستخدمين"), KeyboardButton(text="📊 الإحصائيات الكاملة")],[KeyboardButton(text="📢 بث جماعي"), KeyboardButton(text="💰 إدارة النقاط")],[KeyboardButton(text="🚫 إدارة الحظر"), KeyboardButton(text="📋 سجل الألعاب")],[KeyboardButton(text="🔙 العودة للرئيسية")]], resize_keyboard=True)

def get_games_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="🎰 العجلة", callback_data="game_roulette")],[InlineKeyboardButton(text="🎲 النرد", callback_data="game_dice")],[InlineKeyboardButton(text="🃏 ورق", callback_data="game_cards")],[InlineKeyboardButton(text="🔢 خمن الرقم", callback_data="game_guess")],[InlineKeyboardButton(text="🔄 سلوتس", callback_data="game_slots")]])

def get_cancel_keyboard():
    return ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text="❌ إلغاء")]], resize_keyboard=True)

def get_subscription_keyboard():
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="📢 اشترك في القناة", url=f"https://t.me/{config.REQUIRED_CHANNEL.replace('@','')}")],[InlineKeyboardButton(text="✅ تحقق من الاشتراك", callback_data="check_subscription")]])

async def check_subscription(user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(config.REQUIRED_CHANNEL, user_id)
        return member.status in ["member", "administrator", "creator"]
    except Exception:
        return True

@dp.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    if not await check_subscription(message.from_user.id):
        await message.answer(f"🔒 اشترك في القناة أولاً: {config.REQUIRED_CHANNEL}", reply_markup=get_subscription_keyboard())
        return
    user = db.get_or_create_user(message.from_user.id, message.from_user.username, message.from_user.first_name, message.from_user.last_name)
    if user.get('is_blocked'):
        await message.answer("⚠️ تم حظر حسابك.")
        return
    welcome = f"🎮 <b>مرحباً {message.from_user.first_name}!</b>\n\n💰 رصيدك: {user['points']} نقطة\n\nاختر من الأزرار:"
    keyboard = get_admin_main_keyboard() if user.get('is_admin') else get_main_keyboard()
    await message.answer(welcome, reply_markup=keyboard)

@dp.callback_query(lambda c: c.data == "check_subscription")
async def check_sub_cb(callback: CallbackQuery, state: FSMContext):
    if await check_subscription(callback.from_user.id):
        await callback.message.delete()
        await cmd_start(callback.message, state)
    else:
        await callback.answer("❌ لم تشترك بعد", show_alert=True)

@dp.message(lambda m: m.text == "🎰 الألعاب")
async def show_games(message: Message):
    await message.answer("🎮 اختر لعبتك:", reply_markup=get_games_keyboard())

@dp.message(lambda m: m.text == "💰 رصيدي")
async def show_balance(message: Message):
    user = db.get_user(message.from_user.id)
    if not user: return
    await message.answer(f"💰 نقاطك: {user['points']}\n🏆 فوز: {user['wins']} | خسارة: {user['losses']}\n🎮 لعب: {user['games_played']}")

@dp.message(lambda m: m.text == "🏆 المتصدرين")
async def show_leaderboard(message: Message):
    users = db.get_top_players(10)
    text = "🏆 <b>المتصدرين</b>\n\n"
    for i, u in enumerate(users, 1):
        text += f"{i}. {u['first_name'][:15]} - {u['points']} نقطة\n"
    await message.answer(text)

@dp.message(lambda m: m.text == "🎁 المكافأة اليومية")
async def daily_bonus(message: Message):
    user = db.get_user(message.from_user.id)
    today = datetime.now().date()
    last = user.get('daily_bonus_date')
    if last:
        try:
            if datetime.fromisoformat(last).date() == today:
                await message.answer("⚠️ اخذت مكافأتك اليوم، تعال باجر!")
                return
        except: pass
    pts = 10 + random.randint(0,5)
    db.add_points(message.from_user.id, pts)
    with db.get_connection() as conn:
        conn.cursor().execute('UPDATE users SET daily_bonus_date = CURRENT_TIMESTAMP WHERE telegram_id = ?', (message.from_user.id,)); conn.commit()
    await message.answer(f"🎉 اخذت {pts} نقطة!")

@dp.callback_query(lambda c: c.data.startswith("game_"))
async def game_entry(callback: CallbackQuery, state: FSMContext):
    game = callback.data
    mapping = {"game_roulette": GameStates.ROULETTE_BET, "game_dice": GameStates.DICE_BET, "game_cards": GameStates.CARD_GAME, "game_slots": GameStates.SLOTS_BET, "game_guess": GameStates.GUESS_BET}
    await callback.message.answer("💰 كم نقطة تريد المراهنة؟ (الحد الأدنى 5)", reply_markup=get_cancel_keyboard())
    await state.set_state(mapping[game])
    await callback.answer()

async def handle_bet(message, state, game_type, win_logic):
    if message.text == "❌ إلغاء":
        await state.clear()
        await message.answer("❌ تم الإلغاء", reply_markup=get_main_keyboard())
        return
    try:
        bet = int(message.text)
        if bet < 5:
            await message.answer("الحد الأدنى 5")
            return
        user = db.get_user(message.from_user.id)
        if user['points'] < bet:
            await message.answer(f"رصيدك لا يكفي، عندك {user['points']}")
            return
        db.deduct_points(message.from_user.id, bet)
        win, result_text, multiplier = win_logic()
        if win:
            winnings = bet * multiplier
            db.add_points(message.from_user.id, winnings)
            db.update_user_stats(message.from_user.id, True)
            db.log_game(message.from_user.id, game_type, bet, True)
            await message.answer(f"{result_text}\n\n🎉 فزت! ربحت {winnings} نقطة", reply_markup=get_main_keyboard())
        else:
            db.update_user_stats(message.from_user.id, False)
            db.log_game(message.from_user.id, game_type, bet, False)
            await message.answer(f"{result_text}\n\n😔 خسرت {bet} نقطة", reply_markup=get_main_keyboard())
        await state.clear()
    except ValueError:
        await message.answer("ارسل رقم صحيح")

@dp.message(GameStates.ROULETTE_BET)
async def roulette_bet(message: Message, state: FSMContext):
    def logic():
        r = random.randint(1,36)
        win = random.choice([True, False])
        return win, f"🎰 العجلة وقفت على {r}", 2
    await handle_bet(message, state, "roulette", logic)

@dp.message(GameStates.DICE_BET)
async def dice_bet(message: Message, state: FSMContext):
    def logic():
        d1, d2 = random.randint(1,6), random.randint(1,6)
        total = d1+d2
        win = total in [7,11]
        return win, f"🎲 {d1} + {d2} = {total}", 2
    await handle_bet(message, state, "dice", logic)

@dp.message(GameStates.CARD_GAME)
async def cards_bet(message: Message, state: FSMContext):
    def logic():
        ranks = list(range(2,15))
        p, b = random.choice(ranks), random.choice(ranks)
        win = p > b
        return win, f"🃏 بطاقتك {p} vs الخصم {b}", 2
    await handle_bet(message, state, "cards", logic)

@dp.message(GameStates.SLOTS_BET)
async def slots_bet(message: Message, state: FSMContext):
    def logic():
        symbols = ["🍒","🍋","🔔","💎","⭐"]
        res = [random.choice(symbols) for _ in range(3)]
        txt = f"🎰 {' '.join(res)}"
        if res[0]==res[1]==res[2]: return True, txt+" - جائزة كبرى!", 5
        if res[0]==res[1] or res[1]==res[2] or res[0]==res[2]: return True, txt+" - اثنان متطابقان", 2
        return False, txt, 0
    await handle_bet(message, state, "slots", logic)

@dp.message(GameStates.GUESS_BET)
async def guess_bet_entry(message: Message, state: FSMContext):
    if message.text == "❌ إلغاء":
        await state.clear()
        await message.answer("❌ تم الإلغاء", reply_markup=get_main_keyboard())
        return
    try:
        bet = int(message.text)
        if bet < 5:
            await message.answer("الحد الأدنى 5")
            return
        user = db.get_user(message.from_user.id)
        if user['points'] < bet:
            await message.answer("رصيدك لا يكفي")
            return
        secret = random.randint(1,10)
        await state.update_data(secret=secret, bet=bet)
        db.deduct_points(message.from_user.id, bet)
        await message.answer(f"🔢 خمن رقم من 1 الى 10\nمراهنتك: {bet}\nارسل تخمينك الآن", reply_markup=get_cancel_keyboard())
        await state.set_state(GameStates.GUESS_NUMBER)
    except ValueError:
        await message.answer("ارسل رقم صحيح")

@dp.message(GameStates.GUESS_NUMBER)
async def guess_number_check(message: Message, state: FSMContext):
    if message.text == "❌ إلغاء":
        await state.clear()
        await message.answer("❌ تم الإلغاء", reply_markup=get_main_keyboard())
        return
    try:
        guess = int(message.text)
        data = await state.get_data()
        secret, bet = data['secret'], data['bet']
        if guess == secret:
            winnings = bet*2
            db.add_points(message.from_user.id, winnings)
            db.update_user_stats(message.from_user.id, True)
            db.log_game(message.from_user.id, "guess", bet, True)
            await message.answer(f"🎯 الرقم كان {secret}\n🎉 فزت {winnings} نقطة!", reply_markup=get_main_keyboard())
        else:
            db.update_user_stats(message.from_user.id, False)
            db.log_game(message.from_user.id, "guess", bet, False)
            await message.answer(f"🎯 الرقم كان {secret} وتخمينك {guess}\n😔 خسرت {bet}", reply_markup=get_main_keyboard())
        await state.clear()
    except ValueError:
        await message.answer("ارسل رقم من 1 الى 10")

@dp.message(lambda m: m.text == "🔐 لوحة الإدارة")
async def admin_panel(message: Message):
    user = db.get_user(message.from_user.id)
    if not user or not user.get('is_admin'): return
    await message.answer(f"🔐 لوحة الإدارة\n👥 المستخدمين: {db.get_total_users()}", reply_markup=get_admin_keyboard())

@dp.message(lambda m: m.text == "🔙 العودة للرئيسية")
async def back_main(message: Message):
    user = db.get_user(message.from_user.id)
    kb = get_admin_main_keyboard() if user and user.get('is_admin') else get_main_keyboard()
    await message.answer("🏠 الرئيسية", reply_markup=kb)

@dp.message(Command("add_points"))
async def add_points_cmd(message: Message):
    if not db.get_user(message.from_user.id).get('is_admin'): return
    try:
        _, uid, pts = message.text.split()
        db.add_points(int(uid), int(pts))
        await message.answer(f"✅ تم اضافة {pts} لـ {uid}")
    except: await message.answer("التنسيق: /add_points ID POINTS")

@dp.message(Command("remove_points"))
async def remove_points_cmd(message: Message):
    if not db.get_user(message.from_user.id).get('is_admin'): return
    try:
        _, uid, pts = message.text.split()
        db.deduct_points(int(uid), int(pts))
        await message.answer(f"✅ تم خصم {pts} من {uid}")
    except: await message.answer("التنسيق: /remove_points ID POINTS")

@dp.message(Command("set_points"))
async def set_points_cmd(message: Message):
    if not db.get_user(message.from_user.id).get('is_admin'): return
    try:
        _, uid, pts = message.text.split()
        db.set_points(int(uid), int(pts))
        await message.answer(f"✅ تم تحديد نقاط {uid} الى {pts}")
    except: await message.answer("التنسيق: /set_points ID POINTS")

@dp.message(lambda m: m.text == "📢 بث جماعي")
async def broadcast_start(message: Message, state: FSMContext):
    if not db.get_user(message.from_user.id).get('is_admin'): return
    await message.answer("ارسل رسالة البث:", reply_markup=get_cancel_keyboard())
    await state.set_state(AdminStates.BROADCAST)

@dp.message(AdminStates.BROADCAST)
async def broadcast_send(message: Message, state: FSMContext):
    if message.text == "❌ إلغاء":
        await state.clear()
        await message.answer("❌ تم الإلغاء", reply_markup=get_admin_keyboard())
        return
    users = db.get_all_users()
    ok=0
    for u in users:
        try:
            await bot.send_message(u['telegram_id'], f"📢 {message.text}")
            ok+=1
            await asyncio.sleep(0.05)
        except: pass
    await state.clear()
    await message.answer(f"✅ تم ارسال البث الى {ok}/{len(users)}", reply_markup=get_admin_keyboard())

async def main():
    logging.basicConfig(level=logging.INFO)
    if config.BOT_TOKEN == "ضع_التوكن_هنا" or "AAGaRIO" in config.BOT_TOKEN:
        print("❌ خطأ: غير التوكن! ضع BOT_TOKEN في Environment Variables")
        return
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
