export const Alignment = {
    Left: "left",
    Center: "center",
    Right: "right",
} as const;

export type Alignment = typeof Alignment[keyof typeof Alignment];