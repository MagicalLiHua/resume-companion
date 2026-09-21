export type RecipeId='moka/sd-resume/v1'|'beisen/phoenix-resume/v1'|'feishu/ud-resume/v1'|'dayee/ant-resume/v1'|'51job/legacy-resume/v1'|'guopin/module-editor/v1';
export interface FieldRule {key:string;labels:string[];transform?:'degree'|'study_mode'|'birth_month'|'cities_text';custom?:boolean;company?:string;emptyBranch?:{key:string;value:string}}
export interface SectionRule {sections:string[];sources:string[];fields:FieldRule[];repeated?:boolean;reveal?:boolean;negative?:string[];record_filter?:'english'|'other_languages'}
export interface Recipe {id:RecipeId;family:'sd'|'phoenix'|'ud'|'dayee'|'job51'|'guopin';sections:SectionRule[]}
const f=(key:string,...labels:string[]):FieldRule=>({key,labels});
const basic=[f('full_name','姓名'),f('phone','手机号','手机号码'),f('email','邮箱'),f('gender','性别'),f('birth_date','出生日期'),f('city','所在地','现居住地'),f('employment_status','工作经验','工作年限'),f('highest_education','最高学历'),f('recent_company','最近公司')];
const education=[f('school','学校名称'),f('major','专业名称','专业'),f('college','学院'),{...f('level','学历'),transform:'degree' as const},{...f('study_mode','学历类型','学习形式'),transform:'study_mode' as const},f('degree','学位'),f('range','起止时间','就读时间'),f('current','至今'),f('start','开始时间'),f('end','结束时间')];
const experience=[f('organization','公司名称'),f('role','职位名称'),f('description','描述','工作职责'),f('range','起止时间'),f('current','至今'),f('start','开始时间'),f('end','结束时间')];
const project=[f('name','项目名称'),f('role','项目角色','职责','职务'),f('description','项目描述'),f('responsibilities','项目中职责'),f('range','起止时间'),f('current','至今'),f('start','开始时间'),f('end','结束时间'),f('url','项目链接')];
const tail:SectionRule[]=[
  {sections:['语言能力'],sources:['languages'],repeated:true,fields:[f('name','语言类型','语言'),f('overall','掌握程度','精通程度'),f('speaking','听说'),f('writing','读写')]},
  {sections:['获奖经历'],sources:['awards'],repeated:true,fields:[f('name','奖项名称'),f('obtained_month','获奖时间'),f('description','描述')]},
  {sections:['证书'],sources:['certificates'],repeated:true,fields:[f('name','证书名称'),f('description','描述'),f('obtained_month','获得时间'),f('issuer','颁发机构')]},
  {sections:['竞赛'],sources:['competitions'],repeated:true,fields:[f('name','竞赛名称'),f('description','描述')]},
  {sections:['校园经历'],sources:['campus'],repeated:true,fields:[f('organization','组织名称'),f('role','职位名称'),f('description','描述'),f('range','起止时间')]},
  {sections:['自我描述','自我评价'],sources:['basic'],reveal:true,fields:[f('self_description','自我描述','自我评价')]},
  {sections:['作品链接'],sources:['basic'],fields:[f('portfolio_url','作品链接')]},
];
const basics:SectionRule[]=[{sections:['基本信息','基础信息','个人信息'],sources:['basic'],fields:basic}];
const intent:SectionRule={sections:['求职意向'],sources:['intent'],fields:[f('cities','期望工作城市'),{...f('cities','期望城市'),transform:'cities_text'},f('current_salary','当前薪资'),f('expected_salary','期望薪资'),f('industry','期望从事行业'),f('occupation','期望从事职业')]};
const detailedBasic=[...basic,
 f('phone','移动电话','手机','手机号码 / 号码','手机号 / 号码','手机 / 号码'),f('phone_country','手机号码 / 区号','手机号 / 区号','手机 / 区号'),f('english_test_type','英语水平 / 类型'),f('english_test_result','英语水平 / 等级'),f('other_language','其他外语 / 类型'),f('other_language_level','其他外语 / 等级'),f('email','电子邮箱','电子邮件'),f('highest_education','学历'),
 f('identity_type','证件类型','身份证号 / 类型','身份证号码 / 类型','证件号码 / 类型'),f('identity_number','证件号码','身份证号码','身份证号','证件号码 / 号码','身份证号码 / 号码','身份证号 / 号码'),
 f('ethnicity','民族'),f('political_status','政治面貌'),f('marital_status','婚姻状况'),f('health_status','健康状况'),f('medical_history','病史信息'),
 f('height_cm','身高','身高（cm）'),f('weight_kg','体重','体重（kg）'),
 f('residence_province','现居住地 / 省份','现居住城市 / 省份','目前居住地 / 省份','目前所在城市 / 省份'),f('residence_city','现居住地 / 城市','现居住城市 / 城市','目前居住地 / 城市','目前所在城市 / 城市'),
 f('native_province','籍贯 / 省份'),f('native_city','籍贯 / 城市'),f('origin_province','高考生源地 / 省份'),f('origin_city','高考生源地 / 城市'),
 f('target_province','期望工作地点 / 省份'),f('target_city','期望工作地点 / 城市'),f('address','有效通讯地址','通信地址'),
 f('training_mode','培养方式'),f('highest_school','最高学历毕业院校'),f('highest_major','最高学历专业'),
 f('graduation_date','毕业时间(与毕业证一致)'),f('major_rank','最高学历专业排名'),f('scholarship_status','奖学金情况'),f('failed_courses','挂科情况'),
 f('interview_location','期望面试地点'),f('recruitment_channel','招聘信息获取渠道'),f('veteran_status','是否退役军人'),f('applicant_type','申请者类别')];
const detailedEducation=[...education,f('school','学校'),f('major','专业（高中和初中学历专业选择“其他”）'),
 f('description','专业描述'),f('city_province','城市 / 省份'),f('city','城市 / 城市'),f('major_rank','专业排名'),f('full_time','是否全日制')];
export const recipes:Recipe[]=[
  {id:'guopin/module-editor/v1',family:'guopin',sections:[
    {sections:['求职意向'],sources:['intent'],fields:[f('position_path','期望职位'),f('location_path','工作地区'),f('industry_path','期望行业'),f('salary_min','薪资要求（元/月） / 最低'),f('salary_max','薪资要求（元/月） / 最高')]},
    {sections:['自我评价'],sources:['basic'],fields:[f('self_description','自我评价')]},
    {sections:['资格证书'],sources:['basic'],fields:[f('guopin_certificate_paths','证书名称')]},
    {sections:['项目经历'],sources:['projects'],repeated:true,fields:[f('name','项目名称'),f('role','项目角色'),f('range','起止时间'),f('start','起止时间 / 开始'),f('end','起止时间 / 结束'),f('organization','所在单位'),f('team_size','团队规模'),f('description','项目介绍'),f('responsibilities','项目职责'),f('results','项目成果')]},
    {sections:['工作/实习经历'],sources:['internships','work'],repeated:true,fields:[f('organization','单位名称'),f('company_type','单位性质'),f('role','职位名称'),f('employment_type','工作性质'),f('range','在职时间'),f('start','在职时间 / 开始'),f('end','在职时间 / 结束'),f('description','工作内容'),f('company_headcount','单位规模'),f('department','部门'),f('reports_to','汇报对象'),f('subordinates','下属人数'),f('monthly_salary_yuan','税前月薪'),f('industry_path','所属行业'),f('location_path','工作地区'),f('overseas','海外工作')]},
    {sections:['教育经历'],sources:['education'],repeated:true,fields:[...education.filter(r=>r.key!=='study_mode'),f('enrollment_mode','统招'),f('study_mode','全日制'),f('has_degree','学位证'),f('degree_path','学位细分'),f('range','就读年月'),f('guopin_major_category','专业分类'),f('major_rank','专业排名'),f('has_overseas','海外留学'),f('description','在校经历'),f('school_system','学制'),f('edu_cert_no','学历证书编号'),f('degree_cert_no','学位证书编号')]},
  ]},
  {id:'dayee/ant-resume/v1',family:'dayee',sections:[
    {sections:['个人基本信息'],sources:['basic'],fields:detailedBasic},
    {sections:['教育经历'],sources:['education'],repeated:true,fields:[...detailedEducation.filter(rule=>rule.key!=='study_mode'),f('enrollment_mode','学习形式')]},
    {sections:['实习经历','工作经历'],sources:['internships','work'],repeated:true,fields:[...experience,f('organization','企业名称'),f('company_type','企业性质'),f('company_size','企业规模'),f('description','工作描述')]},
    {sections:['项目经验'],sources:['projects'],repeated:true,fields:[...project,f('responsibilities','项目职责'),f('organization','所属公司')]},
    {sections:['校内职务'],sources:['campus'],repeated:true,fields:[f('organization','学校名称','组织名称','组织/团体名称'),f('role','职务名称','职务','担任职务'),f('cadre_level','干部级别'),f('description','职务描述','工作描述','职责和成就'),f('start','开始时间'),f('end','结束时间')]},
    {sections:['技能资质'],sources:['certificates'],repeated:true,fields:[f('name','证书名称','技能名称','专业技能证书名称'),f('issuer','颁发机构'),f('obtained_month','获得时间'),f('description','证书描述','描述')]},
    {sections:['外语能力'],sources:['languages'],record_filter:'english',fields:[f('overall','英语等级'),f('score','CET 成绩'),f('exam_id','准考证号'),f('exam_month','考试时间'),f('toefl_score','TOFEL分数'),f('ielts_score','IELTS分数'),f('testdaf_score','Test Daf分数'),f('dsh_score','DSH分数'),f('other_scores','其他外语及成绩'),f('report_number','成绩单编号')]},
    {sections:['其他外语能力'],sources:['languages'],record_filter:'other_languages',repeated:true,fields:[f('name','外语语种','语种','其他外语种类'),f('overall','掌握程度','外语等级','其他外语水平'),f('score','成绩')]},
    {sections:['家庭关系'],sources:['family'],repeated:true,fields:[f('name','姓名'),f('relation','关系'),f('phone','联系电话'),f('birth_date','出生日期'),f('organization','工作单位'),f('role','职位'),f('address','现住址'),f('status','现状')]},
    {sections:['科研经历'],sources:['research'],repeated:true,fields:[f('start','开始时间'),f('end','结束时间'),f('name','研究课题/项目'),f('participation','参与度'),f('supervisor','导师'),f('description','成果')]},
    {sections:['自我评价'],sources:['basic'],fields:[f('self_description','评价内容')]},
  ]},
  {id:'51job/legacy-resume/v1',family:'job51',sections:[
    {sections:['个人信息','基本信息'],sources:['basic'],fields:[...detailedBasic,
      ...[f('employment_status','申请者类别'),f('origin_province','生源籍贯所在城市 / 省份'),f('origin_city','生源籍贯所在城市 / 城市'),f('origin_is_jiangsu','生源籍贯是否为江苏省 / 类型'),f('residence_is_jiangsu','目前所在城市是否为江苏省 / 类型'),f('criminal_record','是否有违法犯罪记录'),f('qualification_category','专业技术资格及职业资格证书 / 类型'),f('other_certificates','其他资格证书'),f('written_test_city','意向线下笔试城市'),f('recruitment_channel_job51','从哪里知道招聘信息'),f('available_date','何时可以上班'),f('expected_monthly_salary_band','期望月薪（元）'),f('self_description','个人评价'),
      ...[['origin','生源籍贯'],['residence','目前所在城市']].flatMap(([prefix,label])=>[
        {...f(`${prefix}_jiangsu_city`,`${label}是否为江苏省 / 类别`),emptyBranch:{key:`${prefix}_is_jiangsu`,value:'否'}},
        {...f(`${prefix}_jiangsu_district`,`${label}是否为江苏省 / 明细`),emptyBranch:{key:`${prefix}_is_jiangsu`,value:'否'}},
      ]),
      {...f('qualification_type','专业技术资格及职业资格证书 / 类别'),emptyBranch:{key:'qualification_category',value:'无'}},
      {...f('qualification_name','专业技术资格及职业资格证书 / 明细'),emptyBranch:{key:'qualification_category',value:'无'}},
      ].map(rule=>({...rule,company:'26b69a02-efa5-4674-a984-40bcae578b0a'}))]},
    {sections:['教育经历','教育背景'],sources:['education'],repeated:true,fields:[...detailedEducation.map(rule=>['school','major'].includes(rule.key)?{...rule,custom:true}:rule),f('level','最高学历','其他学历'),{...f('school','毕业学校'),custom:true},{...f('major','所学专业'),custom:true},f('school_other','其他学校'),f('major_other','其他专业'),f('start','入学时间'),f('end','毕业时间'),f('major_rank','学习成绩排名'),f('campus_role','担任职务'),f('courses','主修课程','专业课程'),f('enrolled_unified','是否统招'),f('upgraded_bachelor','是否专升本'),f('overseas','是否有海外留学经历'),f('research_direction','研究方向'),f('college','所在院系'),f('full_time','是否是全日制'),f('class_rank','班级排名'),f('job51_school_region','毕业学校 / 类型'),f('job51_school_option','毕业学校 / 等级'),f('job51_major_category','专业 / 类型'),f('job51_major_option','专业 / 等级')]},
    {sections:['实习/工作经历','实习/工作经验'],sources:['internships','work'],repeated:true,fields:[...experience,f('organization','企业名称'),f('role','职位','职务','职位 / 职位'),f('role_category','职位 / 职类'),f('description','工作描述'),f('start','开始日期'),f('end','结束日期')]},
    {sections:['研究项目经历','项目经历'],sources:['projects'],repeated:true,fields:[...project,f('responsibilities','项目职责'),f('start','开始日期'),f('end','结束日期'),f('role','担任职位/角色'),f('organization','项目单位')]},
    {sections:['社团（学生工作、活动）经历'],sources:['campus'],repeated:true,fields:[f('organization','社团名称','组织名称','社团（组织）名称'),f('role','职务'),f('description','工作描述','经历描述','社团工作经历描述'),f('student_cadre','是否为学生干部'),f('range','起止时间'),f('start','开始时间','开始日期'),f('end','结束时间','结束日期')]},
    {sections:['自我评价'],sources:['basic'],fields:[f('self_description','自我评价'),f('cofco_understanding','我对中粮的认识和看法'),f('self_career_description','自我评价及职业生涯规划')]},
    {sections:['家庭成员信息'],sources:['basic'],fields:[f('father_name','父亲姓名'),f('father_organization_role','父亲工作单位及职位'),f('mother_name','母亲姓名'),f('mother_organization_role','母亲工作单位及职位')]},
    {sections:['语言能力/技能证书'],sources:['basic'],fields:[f('english_test_type','英语水平'),f('english_score','英语成绩'),f('other_language','其他外语水平 / 类型'),f('cofco_other_language_level','其他外语水平 / 等级'),f('primary_it_category','IT技能 / 类型'),f('primary_it_name','IT技能 / 等级'),f('skills_text','其他技能'),f('certificate_names','获得证书名称')]},
    {sections:['获奖情况'],sources:['awards'],repeated:true,fields:[f('name','奖项名称'),f('obtained_month','获奖时间'),f('level','级别 / 类型'),f('grade','级别 / 等级'),f('description','奖项描述')]},
    {sections:['竞赛经历'],sources:['competitions'],repeated:true,fields:[f('name','竞赛名称'),f('award_level','获奖等级'),f('obtained_month','时间'),f('issuer','主办单位'),f('description','竞赛描述')]},
    {sections:['IT技能'],sources:['it_skills'],repeated:true,fields:[f('category','技能 / 类别'),f('name','技能 / 名称'),f('overall','掌握程度')]},
    ...tail,
  ]},
  {id:'moka/sd-resume/v1',family:'sd',sections:[
    ...basics.map(s=>({...s,fields:[...s.fields,{...f('birth_date','出生日期 (年龄)'),transform:'birth_month' as const}]})),intent,
    {sections:['教育背景'],sources:['education'],repeated:true,fields:education.map(x=>x.key==='school'||x.key==='major'?{...x,custom:true}:x)},
    {sections:['工作经历'],sources:['work'],repeated:true,fields:experience,negative:['没有工作经历']},
    {sections:['实习经历'],sources:['internships'],repeated:true,fields:experience,negative:['没有实习经历']},
    {sections:['项目经验'],sources:['projects'],repeated:true,fields:project},...tail]},
  {id:'beisen/phoenix-resume/v1',family:'phoenix',sections:[...basics,intent,
    {sections:['教育经历'],sources:['education'],repeated:true,fields:education},
    {sections:['工作经历'],sources:['work','internships'],repeated:true,fields:experience},
    {sections:['实习经历'],sources:['internships'],repeated:true,fields:experience},
    {sections:['项目经历'],sources:['projects'],repeated:true,fields:project.map(x=>x.key==='description'?{...x,key:'combined_description'}:x)},...tail]},
  {id:'feishu/ud-resume/v1',family:'ud',sections:[...basics.map(s=>({...s,fields:[...s.fields,f('cities','期望工作地点')]})),intent,
    {sections:['教育经历'],sources:['education'],repeated:true,fields:education},
    {sections:['工作经历'],sources:['work'],repeated:true,fields:experience,negative:['没有工作经历']},
    {sections:['实习经历'],sources:['internships'],repeated:true,fields:experience,negative:['没有实习经历']},
    {sections:['项目经历'],sources:['projects'],repeated:true,fields:[...project,f('combined_description','描述')]},...tail]},
];
