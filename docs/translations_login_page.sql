-- Login page: group headings, Rental tile, footer links (zh + th).
-- Merges into the existing language packs — nothing already translated is overwritten.
-- Run in Supabase SQL Editor. (If `t` is a json column instead of jsonb, tell Claude.)

UPDATE app_translations SET t = (t::jsonb || '{
  "loginGroupBusiness":"经营您自己的业务",
  "loginGroupBusinessSub":"免费试用30天，无需信用卡",
  "loginGroupOther":"团队与合作伙伴",
  "loginRental":"租车",
  "loginRentalSub":"登录您的租车业务账户",
  "registerRental":"注册",
  "companyNameHintRental":"如果多家租车公司使用相同用户名，此项可帮助识别您的账户",
  "rentalNameField":"租车公司名称",
  "loginTutorials":"教程",
  "loginHelpDesk":"帮助中心",
  "loginSecurityPolicy":"安全政策",
  "loginMsgAdminWa":"通过 WhatsApp 联系管理员"
}'::jsonb) WHERE lang = 'zh';

UPDATE app_translations SET t = (t::jsonb || '{
  "loginGroupBusiness":"ดำเนินธุรกิจของคุณเอง",
  "loginGroupBusinessSub":"ทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต",
  "loginGroupOther":"ทีมงานและพาร์ทเนอร์",
  "loginRental":"เช่ารถ",
  "loginRentalSub":"เข้าสู่ระบบบัญชีธุรกิจเช่ารถของคุณ",
  "registerRental":"ลงทะเบียน",
  "companyNameHintRental":"ช่วยระบุบัญชีของคุณหากธุรกิจเช่ารถหลายแห่งใช้ชื่อผู้ใช้เดียวกัน",
  "rentalNameField":"ชื่อธุรกิจเช่ารถ",
  "loginTutorials":"บทช่วยสอน",
  "loginHelpDesk":"ศูนย์ช่วยเหลือ",
  "loginSecurityPolicy":"นโยบายความปลอดภัย",
  "loginMsgAdminWa":"ส่งข้อความถึงผู้ดูแลทาง WhatsApp"
}'::jsonb) WHERE lang = 'th';
