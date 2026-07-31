-- 店铺日事实补上花出去的钱。
--
-- 罗盘自助取数的「支出」类给了这些（2026-07-31 用 preview 接口核对列名）：
--   投放消耗（店铺被投）      ad_costed_amt
--   支出金额（店铺被投）      cost_amt
--   平台佣金（财务已结算）    shop_serv_amt
--   达人佣金（财务已结算）    real_commission
-- 加上两项与投放直接相关的成交口径：
--   投放贡献成交金额          ad_receive_amt
--   净成交金额                net_income_amt
--
-- 原先表里只有收进来的钱，没有花出去的钱，因此算不了投放费比，也答不了「广告费多少」。
-- 指标一律全选后这些列本来就在导出文件里，缺的只是落库的位置。
--
-- 不存平台自己的「投放费比 / 综合费比」：它有「剔除退款」等多个变体，口径不一，
-- 存一个说不清是哪种口径的比率，比不存更糟。费比由这里的金额按明确定义现算。
ALTER TABLE commerce_store_daily_facts ADD COLUMN ad_cost_amount REAL;
ALTER TABLE commerce_store_daily_facts ADD COLUMN expense_amount REAL;
ALTER TABLE commerce_store_daily_facts ADD COLUMN platform_commission REAL;
ALTER TABLE commerce_store_daily_facts ADD COLUMN influencer_commission REAL;
ALTER TABLE commerce_store_daily_facts ADD COLUMN ad_contributed_amount REAL;
ALTER TABLE commerce_store_daily_facts ADD COLUMN net_transaction_amount REAL;
