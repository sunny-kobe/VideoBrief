/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QAPair, ResearchNote } from './types';

interface SampleNoteRecord {
  note: ResearchNote;
  qaPairs: QAPair[];
}

const sharedDisclaimer =
  '免责声明：本研究笔记基于公开英文视频及其公开页面信息整理，用于学习、研究与产品样例展示。笔记不构成投资建议、法律建议、医疗建议或商业决策保证；如需用于真实业务，应回看原视频、核对完整 transcript，并结合独立判断。';

export const sampleNotes: Record<string, SampleNoteRecord> = {
  'andrew-ng-ai-for-any-business': {
    note: {
      id: 'andrew-ng-ai-for-any-business',
      videoUrl: 'https://www.ted.com/talks/andrew_ng_how_ai_could_empower_any_business',
      channelName: 'TED / Andrew Ng',
      duration: '11:16',
      languageDirection: '英语 -> 中文',
      status: 'completed',
      title: 'Andrew Ng：AI 如何赋能任何一家企业',
      conclusion:
        'Andrew Ng 的核心判断是：AI 的价值不应只属于拥有海量数据和工程团队的大公司，真正的机会在于让领域专家用少量、自有、贴近业务的数据训练出足够有用的垂直 AI。',
      coreSummaries: [
        {
          label: 'AI 民主化',
          description:
            '演讲反复强调，许多行业并不需要互联网巨头级别的数据规模；一家披萨店、工厂或小型零售商，只要能把自己的业务知识转成数据和规则，也能获得可落地的 AI 能力。',
        },
        {
          label: '长尾场景',
          description:
            '大量中小企业的需求过于碎片化，传统软件公司不愿为每个小场景定制系统。低代码、数据标注和可配置 AI 工具可以把这些长尾需求变成经济上可行的产品形态。',
        },
        {
          label: '人的角色变化',
          description:
            'AI 不只是替代专家，而是把专家的经验转成可扩展系统。关键工作从“写模型代码”转向“定义任务、提供样本、校准结果、持续反馈”。',
        },
      ],
      audiences: [
        '中小企业老板',
        'AI SaaS 创业者',
        '传统行业数字化负责人',
        '产品经理与解决方案顾问',
      ],
      limitations: [
        '演讲偏愿景和产品方向，没有展开数据治理、隐私、安全、模型维护成本等落地细节。',
        '案例偏向可观察、可标注的业务问题，对强监管、高风险或因果关系复杂的决策场景，需要更严格验证。',
      ],
      chapters: [
        {
          timestamp: '00:00',
          title: 'AI 仍主要服务少数大公司',
          content:
            '开场指出，AI 系统通常昂贵、依赖高技能工程师维护，因此最先在拥有海量数据的大型科技公司中产生回报。这也造成一个反差：许多真实经济部门有大量局部优化机会，却没有能力独立建设 AI。',
        },
        {
          timestamp: '02:20',
          title: '披萨店案例：小数据也能产生业务价值',
          content:
            '演讲用本地披萨店预测每日口味销量作为例子，说明小企业不一定需要大规模通用模型。只要任务足够清晰，历史销售、星期、天气或活动等自有数据就能帮助做更好的库存和生产决策。',
        },
        {
          timestamp: '05:10',
          title: '领域专家应直接参与 AI 构建',
          content:
            'Ng 强调，让业务专家自己标注、调试和反馈，比完全依赖工程团队更可扩展。AI 工具的下一步是降低构建门槛，让懂业务的人把隐性经验转成可训练样本。',
        },
        {
          timestamp: '08:30',
          title: '从大公司 AI 到长尾经济体 AI',
          content:
            '演讲最后把问题提升到社会层面：如果更多行业和小企业能使用 AI，生产率提升就不会只集中在少数平台公司，而可能扩散到制造、服务、农业、零售等更广泛经济活动中。',
        },
      ],
      insights: [
        {
          title: 'AI 产品机会在“业务专家可操作”',
          description:
            '如果一个 AI 产品只能由机器学习工程师配置，它很难覆盖长尾行业。真正可规模化的产品需要让业务人员完成任务定义、样本提供和结果校准。',
        },
        {
          title: '中小企业 AI 不一定追求通用智能',
          description:
            '披萨销量、质检缺陷、库存预测这类任务并不需要一个无所不能的模型，而需要可靠、便宜、能嵌入日常流程的窄模型。',
        },
        {
          title: '数据壁垒从“大量”转向“贴近业务”',
          description:
            '对许多企业来说，数据量不是唯一优势。更重要的是数据是否反映真实流程，以及是否能由懂业务的人持续纠偏。',
        },
      ],
      concepts: [
        {
          concept: '长尾 AI 场景',
          explanation:
            '指单个场景规模不大、但数量巨大的行业问题，例如小店库存、工厂质检、门店排班。传统定制软件成本高，AI 工具化后才可能覆盖。',
        },
        {
          concept: '业务专家参与式 AI',
          explanation:
            '让一线专家直接参与样本选择、标注、结果判断和规则反馈，使模型贴近真实业务，而不是由工程团队孤立建模。',
        },
        {
          concept: '小数据可用性',
          explanation:
            '不是所有 AI 任务都需要互联网级数据。若问题边界清晰、反馈周期短、错误成本可控，小规模高质量数据也能产生价值。',
        },
      ],
      actions: [
        {
          task: '列出 5 个高频、低风险、可观察的业务决策',
          priority: 'high',
          context:
            '例如库存补货、内容分类、客户线索优先级、质检图片预筛。先避开合规高风险或结果难验证的决策。',
        },
        {
          task: '让业务人员定义好坏样本',
          priority: 'high',
          context:
            '不要从模型开始，而是让最懂业务的人给出正反例、判定标准和人工处理流程，这是垂直 AI 的核心资产。',
        },
        {
          task: '用一周做小闭环验证',
          priority: 'medium',
          context:
            '只验证一个任务：输入、AI 输出、人工复核、业务结果。不要一开始就做平台化、自动化和复杂集成。',
        },
      ],
      questions: [
        '这条演讲对中小企业最大的启发是什么？',
        '为什么 Andrew Ng 认为小数据也可能有价值？',
        '这套思路适合 VideoBrief 这类一人公司吗？',
        '落地时最大的风险和限制是什么？',
      ],
      keyMoments: [
        {
          id: 'ng-km-1',
          timestamp: '02:20',
          title: '披萨店预测需求的例子',
          description:
            '用非常小的本地业务场景解释 AI 民主化：不是所有价值都来自大平台数据。',
          thumbnailUrl:
            'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=300&q=80',
        },
        {
          id: 'ng-km-2',
          timestamp: '05:10',
          title: '业务专家参与模型构建',
          description:
            '把 AI 构建的关键从纯工程能力，转移到业务专家可参与的样本和反馈流程。',
          thumbnailUrl:
            'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=300&q=80',
        },
      ],
      disclaimer: sharedDisclaimer,
      remainingCredits: 145,
    },
    qaPairs: [
      {
        question: '这条演讲对中小企业最大的启发是什么？',
        answer:
          '最大的启发是：中小企业不必等待通用 AI 变得完美，也不必复制大公司的数据规模。更现实的路径是挑一个清晰、可验证、错误成本可控的业务问题，用自己的小数据和业务专家反馈做窄场景 AI。',
        sources: [
          { timestamp: '02:20', label: '披萨店小数据案例' },
          { timestamp: '08:30', label: '长尾经济体 AI' },
        ],
        keywords: ['中小', '小企业', '启发', 'business', 'small'],
      },
      {
        question: '为什么 Andrew Ng 认为小数据也可能有价值？',
        answer:
          '因为很多企业问题的边界足够窄，目标也很具体。例如某家店某几种商品的需求预测，不需要覆盖全球用户行为，只需要能反映本店规律的高质量样本和持续校准。',
        sources: [{ timestamp: '02:20', label: '披萨店预测需求的例子' }],
        keywords: ['小数据', '数据', 'value', 'data'],
      },
      {
        question: '这套思路适合 VideoBrief 这类一人公司吗？',
        answer:
          '这条回答来自旧样例。当前 VideoBrief 不再把英文 YouTube 视频转中文研究笔记作为主线；更适合借鉴的是它的结构化输出和时间戳交互，把这些能力迁移到海外 AI 信息再制生产台。',
        sources: [{ timestamp: '05:10', label: '业务专家参与模型构建' }],
        keywords: ['VideoBrief', '一人公司', '创业', '适合'],
      },
      {
        question: '落地时最大的风险和限制是什么？',
        answer:
          '限制在于演讲没有细讲数据隐私、模型维护、错误责任和组织流程改造。中小企业做 AI 时，最好先从低风险辅助决策开始，保留人工复核。',
        sources: [{ timestamp: '00:00', label: 'AI 系统成本和门槛' }],
        keywords: ['风险', '限制', '隐私', '维护'],
      },
    ],
  },
  'greg-brockman-chatgpt-potential': {
    note: {
      id: 'greg-brockman-chatgpt-potential',
      videoUrl:
        'https://www.ted.com/talks/greg_brockman_the_inside_story_of_chatgpt_s_astonishing_potential',
      channelName: 'TED / Greg Brockman',
      duration: '30:09',
      languageDirection: '英语 -> 中文',
      status: 'completed',
      title: 'Greg Brockman：ChatGPT 惊人潜力的幕后故事',
      conclusion:
        '这场演讲把 ChatGPT 呈现为一种新的“协作型计算界面”：它不只是聊天机器人，而是能调用工具、读写信息、帮助用户把模糊目标推进成具体产出的工作伙伴。',
      coreSummaries: [
        {
          label: '自然语言界面',
          description:
            'ChatGPT 的突破不只在模型能力，也在交互方式：用户可以用自然语言描述目标、补充偏好、纠正结果，让系统逐步逼近可用答案。',
        },
        {
          label: '工具调用雏形',
          description:
            '演讲展示了插件和工具能力的早期形态：模型不再只生成文本，还可以辅助浏览、计算、组合信息和执行多步骤任务。',
        },
        {
          label: '风险与部署节奏',
          description:
            'Brockman 与 Chris Anderson 的对谈触及发布强大 AI 的风险，强调需要通过真实使用、反馈和安全机制不断迭代，而不是假设一次性设计就能解决所有问题。',
        },
      ],
      audiences: ['AI 产品经理', '开发者', 'SaaS 创业者', '关注 AI 安全和产品化的人'],
      limitations: [
        '演讲是 OpenAI 视角的产品展示，天然更强调潜力，对失败案例、成本结构和长期治理挑战讨论有限。',
        '插件和工具调用展示处在早期阶段，不能直接等同于今天生产环境中的稳定 Agent 能力。',
      ],
      chapters: [
        {
          timestamp: '00:00',
          title: 'ChatGPT 从聊天框变成协作界面',
          content:
            '开场展示 ChatGPT 如何把用户的自然语言需求转成可迭代输出。重点不在一次回答完美，而在用户可以继续追问、修正、要求不同格式。',
        },
        {
          timestamp: '05:40',
          title: '模型背后的设计原则',
          content:
            'Brockman 解释 ChatGPT 的产品化来自模型能力、反馈训练和人机交互设计的组合。它把复杂系统包进一个低门槛界面中。',
        },
        {
          timestamp: '12:30',
          title: '插件与工具调用展示',
          content:
            '演讲中展示模型连接外部工具的可能性：它可以围绕用户目标调用信息源、处理上下文并产出结构化结果。这是后来 AI Agent 产品形态的重要早期信号。',
        },
        {
          timestamp: '22:00',
          title: '关于风险、发布和社会反馈',
          content:
            '对谈部分讨论了强大 AI 工具公开发布的风险。核心观点是，安全不是发布前一次性完成的清单，而是需要在真实使用中持续发现问题并改进。',
        },
      ],
      insights: [
        {
          title: '好 AI 产品不是“答题机”，而是任务推进器',
          description:
            'ChatGPT 的价值在于承接用户意图，把目标拆成步骤、产出草稿、接受反馈，再继续修改。这比单轮问答更接近生产力工具。',
        },
        {
          title: '工具调用让模型进入真实工作流',
          description:
            '只会生成文本的模型容易停留在建议层；能调用工具、处理文件和结构化输出时，才开始接近可交付工作。',
        },
        {
          title: '真实反馈是安全和产品迭代的一部分',
          description:
            '演讲没有把风险淡化成纯技术问题，而是承认部署后的用户反馈、边界设定和迭代机制同样重要。',
        },
      ],
      concepts: [
        {
          concept: 'RLHF（人类反馈强化学习）',
          explanation:
            '一种用人类偏好反馈改进模型输出的方法，使模型更符合用户期待和安全要求。ChatGPT 的早期产品体验与这种训练思路密切相关。',
        },
        {
          concept: '插件 / 工具调用',
          explanation:
            '让模型通过受控接口使用外部工具，例如检索、计算、浏览、写入系统等，从文本生成扩展到任务执行。',
        },
        {
          concept: '协作型 AI 界面',
          explanation:
            '用户不是一次性提交需求，而是在对话中逐步校准目标、格式和约束，AI 则持续帮助推进任务。',
        },
      ],
      actions: [
        {
          task: '把 VideoBrief 的 AI Ask 限定为 transcript-grounded',
          priority: 'high',
          context:
            '只允许围绕当前视频底稿回答，并在回答里显示时间戳来源。超出视频内容时明确说“原视频没有支持”。',
        },
        {
          task: '优先做可复制的结构化输出',
          priority: 'high',
          context:
            '用户真正要带走的是研究笔记、行动清单和可继续追问的问题，不是单纯聊天体验。',
        },
        {
          task: '为未来 Agent 能力预留工具边界',
          priority: 'medium',
          context:
            '先定义 AskService、MarkdownExport、TranscriptSearch 等接口，避免把 UI 直接绑死在某个模型调用上。',
        },
      ],
      questions: [
        '这场演讲最值得产品经理学习的点是什么？',
        '插件和工具调用为什么重要？',
        'ChatGPT 发布风险这段给创业者什么提醒？',
        'VideoBrief 应该借鉴什么，不应该借鉴什么？',
      ],
      keyMoments: [
        {
          id: 'gb-km-1',
          timestamp: '12:30',
          title: '插件和工具调用演示',
          description: '模型从纯文本回答走向调用外部工具，是 AI 产品进入真实任务流的关键转折。',
          thumbnailUrl:
            'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=300&q=80',
        },
        {
          id: 'gb-km-2',
          timestamp: '22:00',
          title: '关于发布风险的对谈',
          description: '讨论强大 AI 工具公开部署后，如何依赖反馈、安全机制和迭代改进。',
          thumbnailUrl:
            'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=300&q=80',
        },
      ],
      disclaimer: sharedDisclaimer,
      remainingCredits: 132,
    },
    qaPairs: [
      {
        question: '这场演讲最值得产品经理学习的点是什么？',
        answer:
          '最值得学的是把 AI 当成“可迭代协作界面”设计，而不是只追求一次性回答。产品要允许用户补充上下文、改变格式、追问来源，并把输出落到具体工作物上。',
        sources: [{ timestamp: '00:00', label: 'ChatGPT 作为协作界面' }],
        keywords: ['产品经理', '学习', '产品', 'PM'],
      },
      {
        question: '插件和工具调用为什么重要？',
        answer:
          '因为它让模型从“说”进入“做”。对 VideoBrief 来说，未来工具调用可以是搜索 transcript、生成 Markdown、保存笔记、创建分享链接，而不是让模型自由发挥。',
        sources: [{ timestamp: '12:30', label: '插件与工具调用展示' }],
        keywords: ['插件', '工具', '调用', 'agent'],
      },
      {
        question: 'ChatGPT 发布风险这段给创业者什么提醒？',
        answer:
          '提醒是：越强的 AI 产品越需要清楚边界。创业者不要把“模型能回答”当成“产品可负责”，应设置来源、免责声明、反馈和人工纠偏机制。',
        sources: [{ timestamp: '22:00', label: '风险、发布和社会反馈' }],
        keywords: ['风险', '发布', '创业', '安全'],
      },
      {
        question: 'VideoBrief 应该借鉴什么，不应该借鉴什么？',
        answer:
          '应该借鉴自然语言追问和结构化输出，不应该一开始就做通用聊天机器人。VideoBrief 的护城河应来自 transcript-grounded 的研究笔记质量，而不是无边界聊天。',
        sources: [
          { timestamp: '00:00', label: '协作型界面' },
          { timestamp: '12:30', label: '工具调用边界' },
        ],
        keywords: ['VideoBrief', '借鉴', '不应该', '聊天'],
      },
    ],
  },
  'ian-bremmer-global-superpower': {
    note: {
      id: 'ian-bremmer-global-superpower',
      videoUrl:
        'https://www.ted.com/talks/ian_bremmer_the_next_global_superpower_isn_t_who_you_think',
      channelName: 'TED / Ian Bremmer',
      duration: '14:58',
      languageDirection: '英语 -> 中文',
      status: 'completed',
      title: 'Ian Bremmer：下一个全球超级力量并不是你以为的国家',
      conclusion:
        'Ian Bremmer 的核心观点是：未来全球秩序不只由国家竞争决定，科技公司、数字平台和 AI 基础设施正在成为新的权力中心，甚至可能影响民主、主权和社会选择。',
      coreSummaries: [
        {
          label: '权力结构变化',
          description:
            '传统地缘政治关注国家之间的力量对比，但演讲提醒我们，数字平台和科技公司已在信息流、身份、社交关系和 AI 能力上掌握准治理权。',
        },
        {
          label: '技术不是中立背景',
          description:
            '技术公司决定什么内容被放大、什么规则被执行、什么数据被收集。这些选择会影响公共讨论、经济机会和政治结果。',
        },
        {
          label: '民主选择被重新定义',
          description:
            '如果数字空间越来越像社会基础设施，那么用户、政府和企业需要重新讨论谁来制定规则、谁承担责任、谁拥有退出和监督权。',
        },
      ],
      audiences: ['国际关系研究者', '科技政策从业者', '平台产品负责人', 'AI 治理关注者'],
      limitations: [
        '演讲是宏观框架型分析，对具体国家、公司和监管工具的操作层面展开不多。',
        '它更强调科技权力的上升，对开源生态、公共部门能力和多边治理的反制力量讨论相对有限。',
      ],
      chapters: [
        {
          timestamp: '00:00',
          title: '谁在运行世界：问题已经变复杂',
          content:
            'Bremmer 从“谁掌控世界”这个问题切入，说明过去可以用国家权力解释大部分全球秩序，但今天的权力来源更多元。',
        },
        {
          timestamp: '03:20',
          title: '国家秩序之外的平台力量',
          content:
            '演讲指出，科技公司在数字空间中拥有类似规则制定者的角色。它们控制连接、信息分发和数据基础设施，影响大量人的日常生活。',
        },
        {
          timestamp: '07:40',
          title: 'AI 进一步放大科技权力',
          content:
            '当 AI 成为基础设施，谁拥有模型、算力、数据和分发入口，谁就能在经济、认知和治理层面获得更大影响力。',
        },
        {
          timestamp: '12:10',
          title: '未来民主需要新的参与方式',
          content:
            '结尾强调，面对新的全球权力结构，普通人、政府和企业都不能只做旁观者。技术规则如何制定，将影响未来民主和社会选择。',
        },
      ],
      insights: [
        {
          title: 'AI 产品也在参与信息秩序',
          description:
            '哪怕是 VideoBrief 这样的笔记工具，也会影响用户理解英文信息的方式。因此产品必须重视来源、限制、免责声明和可追溯性。',
        },
        {
          title: '平台权力来自默认设置',
          description:
            '用户看到什么、忽略什么、如何被推荐，往往由平台默认机制决定。默认设置本身就是一种治理。',
        },
        {
          title: '技术创业要提前考虑治理边界',
          description:
            '如果一个产品处理知识、新闻、金融或公共议题，它不能只追求增长，也需要建立透明度、纠错和责任机制。',
        },
      ],
      concepts: [
        {
          concept: '数字主权',
          explanation:
            '指国家、组织或个人在数字基础设施、数据、算法和平台规则上的控制权。它正在成为地缘政治的一部分。',
        },
        {
          concept: '平台治理',
          explanation:
            '平台通过内容规则、推荐系统、账号政策、API 权限等方式塑造用户行为和公共讨论。',
        },
        {
          concept: 'AI 基础设施权力',
          explanation:
            '当模型、算力、数据和分发渠道成为社会基础设施，控制这些资源的机构就拥有超出传统软件公司的影响力。',
        },
      ],
      actions: [
        {
          task: '为 VideoBrief 每条笔记显示来源和局限',
          priority: 'high',
          context:
            '不要只输出结论。必须展示视频 URL、时间戳、原视频局限和免责声明，让用户知道笔记来自哪里，也知道它不能覆盖什么。',
        },
        {
          task: '对公共议题内容增加立场中性提示',
          priority: 'medium',
          context:
            '政治、经济和国际关系视频容易有观点偏向。样例和产品输出要区分“演讲者观点”和“事实”。',
        },
        {
          task: '设计用户反馈入口',
          priority: 'medium',
          context:
            '如果摘要误读、遗漏或倾向性过强，用户应该能快速反馈，并在未来版本中触发重新分析。',
        },
      ],
      questions: [
        '这条演讲为什么适合做 VideoBrief 样例？',
        '科技公司为什么会成为全球权力中心？',
        'AI 对全球权力结构的影响是什么？',
        '这类公共议题笔记应该如何避免误导？',
      ],
      keyMoments: [
        {
          id: 'ib-km-1',
          timestamp: '03:20',
          title: '平台力量进入全球秩序',
          description: '从国家权力扩展到平台权力，解释为什么科技公司影响公共生活。',
          thumbnailUrl:
            'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=300&q=80',
        },
        {
          id: 'ib-km-2',
          timestamp: '07:40',
          title: 'AI 放大数字基础设施权力',
          description: '模型、算力、数据和入口成为新的战略资源，改变权力分配。',
          thumbnailUrl:
            'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=300&q=80',
        },
      ],
      disclaimer: sharedDisclaimer,
      remainingCredits: 118,
    },
    qaPairs: [
      {
        question: '这条演讲为什么适合做 VideoBrief 样例？',
        answer:
          '它适合展示 VideoBrief 对宏观公共议题视频的处理能力：不是逐句翻译，而是抽出权力结构、技术治理和行动启发，同时保留演讲局限。',
        sources: [{ timestamp: '00:00', label: '谁在运行世界' }],
        keywords: ['适合', '样例', 'VideoBrief'],
      },
      {
        question: '科技公司为什么会成为全球权力中心？',
        answer:
          '因为它们控制数字空间的基础设施：信息分发、账号身份、推荐机制、数据流和平台规则。这些能力会影响社会如何沟通、组织和决策。',
        sources: [{ timestamp: '03:20', label: '国家秩序之外的平台力量' }],
        keywords: ['科技公司', '权力', '平台'],
      },
      {
        question: 'AI 对全球权力结构的影响是什么？',
        answer:
          'AI 会把平台权力进一步放大。拥有模型、算力、数据和分发入口的机构，不只是提供工具，还可能影响知识生产、经济机会和公共判断。',
        sources: [{ timestamp: '07:40', label: 'AI 放大科技权力' }],
        keywords: ['AI', '全球', '权力', '影响'],
      },
      {
        question: '这类公共议题笔记应该如何避免误导？',
        answer:
          '应明确标注“这是演讲者观点的整理”，保留原视频局限，不把预测包装成事实，并鼓励用户回看关键时间戳。对政治和经济议题尤其要避免单一立场替代原文。',
        sources: [{ timestamp: '12:10', label: '未来民主和参与方式' }],
        keywords: ['误导', '公共', '立场', '局限'],
      },
    ],
  },
};

export const defaultSampleNoteId = 'andrew-ng-ai-for-any-business';

export function getSampleResearchNote(id: string): ResearchNote {
  return sampleNotes[id]?.note ?? sampleNotes[defaultSampleNoteId].note;
}

export function getSampleQaPairs(noteId: string): QAPair[] {
  return sampleNotes[noteId]?.qaPairs ?? sampleNotes[defaultSampleNoteId].qaPairs;
}
