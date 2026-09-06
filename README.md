# سیستم نظارت پروژه‌ها — نسخه 1.0

یک Web App بسیار سبک برای نظارت مدیریتی بر پروژه‌ها.

## قابلیت‌ها

### مدیر
- مشاهده همه پروژه‌ها
- ایجاد پروژه
- حذف پروژه
- ویرایش نام، توضیح، مسئول و وضعیت پروژه
- مشاهده تاریخچه کامل
- ثبت بروزرسانی
- مشاهده هشدار پروژه‌هایی که مدت زیادی بدون بروزرسانی مانده‌اند

### کارشناس
- مشاهده پروژه‌های اختصاص‌یافته به خودش
- ثبت بروزرسانی کوتاه
- مشاهده تاریخچه پروژه‌های خودش

### تصمیم طراحی
بروزرسانی‌ها عمداً قابل ویرایش یا حذف نیستند تا تاریخچه واقعی و قابل اتکا بماند.

---

# راه‌اندازی رایگان

این پروژه برای اجرا به شکل زیر طراحی شده است:

- Frontend: GitHub Pages
- Database/Auth: Supabase
- کد: HTML/CSS/JavaScript ساده
- هزینه نرم‌افزار: صفر، تا زمانی که در محدودیت‌های پلن رایگان سرویس‌ها باشید.

## مرحله 1 — ساخت Supabase

در Supabase یک پروژه بسازید.

بعد از ساخت پروژه:

1. SQL Editor را باز کنید.
2. محتوای `supabase.sql` را کامل Paste کنید.
3. Run را بزنید.

## مرحله 2 — ساخت دو مدیر

در Authentication > Users دو کاربر بسازید.

مثلاً:

- manager1@yourcompany.com
- manager2@yourcompany.com

بعد UUID هر کاربر را بردارید و انتهای `supabase.sql` را طبق نمونه به‌روزرسانی کنید:

```sql
update public.profiles
set role = 'manager', full_name = 'مدیر اول'
where id = 'UUID-MANAGER-1';

update public.profiles
set role = 'manager', full_name = 'مدیر دوم'
where id = 'UUID-MANAGER-2';
```

## مرحله 3 — ساخت کارشناسان

برای هر کارشناس در Authentication > Users یک حساب بسازید.

Profile آنها به صورت خودکار ساخته می‌شود و نقش پیش‌فرض `expert` خواهد بود.

برای کمتر از 30 کارشناس مشکلی از نظر طراحی وجود ندارد.

## مرحله 4 — اتصال Frontend

فایل `config.js` را باز کنید:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY"
};
```

مقادیر واقعی را از:

Supabase > Project Settings > API

کپی کنید.

## مرحله 5 — تست

فایل‌ها را روی یک سرویس استاتیک یا GitHub Pages قرار دهید.

ساختار باید دقیقاً این باشد:

```text
index.html
app.js
styles.css
config.js
```

سپس `index.html` را باز کنید.

---

# انتشار روی GitHub Pages

1. یک Repository جدید بسازید.
2. چهار فایل اصلی را در root قرار دهید.
3. به Settings > Pages بروید.
4. Source را روی GitHub Actions/Pages طبق تنظیمات فعلی GitHub قرار دهید.
5. سایت منتشر می‌شود.

اگر Repository عمومی باشد، کد frontend عمومی است؛ این طبیعی است.
امنیت داده‌ها توسط Supabase RLS انجام می‌شود و نباید کلید `service_role` را هرگز داخل `config.js` قرار دهید.

---

# ساختار داده

## profiles

```text
id
full_name
email
role
active
created_at
```

## projects

```text
id
name
description
assigned_to
status
latest_update
created_by
created_at
updated_at
```

## project_updates

```text
id
project_id
user_id
content
created_at
```

---

# قانون اصلی سیستم

مدیر در صفحه اول باید بتواند در چند ثانیه بفهمد:

1. چه پروژه‌هایی فعال‌اند؟
2. آخرین اتفاق هر پروژه چیست؟
3. آخرین بروزرسانی چه زمانی بوده؟
4. کدام پروژه مدت زیادی بدون بروزرسانی مانده؟

کارشناس نیز برای ثبت یک اتفاق فقط یک کادر متن و یک دکمه دارد.

---

# نکته امنیتی

هرگز این موارد را در frontend قرار ندهید:

- Supabase service_role key
- رمز مدیر
- رمز کارشناسان

فقط `anon key` را در frontend قرار دهید.

RLS موجود در `supabase.sql` دسترسی‌ها را کنترل می‌کند.
