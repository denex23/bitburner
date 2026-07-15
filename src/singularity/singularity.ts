import { Context } from "src/models/context";

const SINGULARITY_SCRIPT_MAP = {
    installBackdoor: "src/singularity/workers/installBackdoor.js",
} as const;

type SingularityFunctionName = keyof typeof SINGULARITY_SCRIPT_MAP;
type SingularityArgument = string | number | boolean;

export class Singularity
{
    public constructor(private readonly context: Context) {}

    public installBackdoor(): boolean
    {
        return this.execute("installBackdoor", []);
    }

    private execute(functionName: SingularityFunctionName, arguments_: SingularityArgument[]): boolean
    {
        const script = SINGULARITY_SCRIPT_MAP[functionName];
        const processId = this.context.ns.exec(
            script,
            "home",
            1,
            ...arguments_,
        );

        return processId !== 0;
    }
}
