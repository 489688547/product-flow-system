-- 短视频日事实补一列「用户支付金额」。
--
-- 罗盘自助取数的短视频维度给的是「短视频用户支付金额」（video_pay_amt），
-- 它与「成交金额」是两个口径，表里原先只有 transaction_amount。
-- 没有对应列时只剩两条路：要么丢掉这个数，要么把它塞进 transaction_amount 冒充成交金额
-- ——后者会造出看起来权威的错值，而且落库后与真数长得一模一样。
--
-- 直播日事实早就有这一列，短视频缺是遗漏。
ALTER TABLE commerce_video_daily_facts ADD COLUMN user_payment_amount REAL;
