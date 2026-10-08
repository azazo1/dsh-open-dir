import type { Target } from '../shared/protocol.ts';
export declare const HELP = "\u7528\u6CD5: dsh-open [\u9009\u9879] [\u76EE\u5F55]\n\n\u7701\u7565\u76EE\u5F55\u65F6\u6253\u5F00\u5F53\u524D\u76EE\u5F55, \u6210\u529F\u9000\u51FA\u524D\u7B49\u5F85 DSH \u754C\u9762\u5B8C\u6210\u5DE5\u4F5C\u533A\u5BFC\u822A.\n\n\u9009\u9879:\n  --target desktop|web  \u9009\u62E9\u754C\u9762, \u9ED8\u8BA4 desktop\n  --instance <ID>       \u9009\u62E9\u5177\u4F53 Host \u5B9E\u4F8B, \u6709\u591A\u4E2A\u5B9E\u4F8B\u65F6\u4F7F\u7528\n  --timeout <\u79D2>        \u603B\u7B49\u5F85\u65F6\u95F4, \u9ED8\u8BA4 30, \u8303\u56F4 1..300\n  --no-launch           \u4E0D\u5524\u8D77 Desktop, \u8FDE\u63A5\u5DF2\u7ECF\u8FD0\u884C\u7684\u5B9E\u4F8B\n  --verbose             \u8F93\u51FA\u9636\u6BB5\u548C\u8BCA\u65AD\u65E5\u5FD7\n  --help, -h            \u663E\u793A\u5E2E\u52A9\n  --version             \u663E\u793A CLI \u7248\u672C\n  --                    \u540E\u9762\u7684\u53C2\u6570\u6309\u76EE\u5F55\u5904\u7406\n\n\u793A\u4F8B:\n  dsh-open .\n  dsh-open ~/projects/my-project\n  dsh-open --target web --no-launch .\n";
export interface Options {
    path: string;
    target: Target;
    timeout: number;
    launch: boolean;
    instance?: string;
    verbose: boolean;
    action: 'open' | 'help' | 'version';
}
export declare function parseArgs(args: string[]): Options;
export declare function canonicalDirectory(path: string): Promise<string>;
