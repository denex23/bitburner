export interface LandingOrderRow
{
    transition: string;
    samples: number;
    averageGapMs: number;
    minimumGapMs: number;
    maximumGapMs: number;
    orderViolations: number;
    worstTarget: string;
}
