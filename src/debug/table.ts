import { Alignment } from "/src/debug/cell-alignment";
import { Column } from "/src/debug/reports/table-column";

export class Table
{
    private readonly columns: Column[] = [];
    private readonly rows: string[][] = [];

    public column(name: string, width?: number, alignment: Alignment = Alignment.Left): Table
    {
        if (width !== undefined && width <= 0) {
            throw new Error("Column width must be greater than 0.");
        }

        this.columns.push({
            name,
            width,
            alignment,
        });

        return this;
    }

    public row(...values: string[]): Table
    {
        if (values.length !== this.columns.length) {
            throw new Error(
                `Expected ${this.columns.length} values but got ${values.length}.`
            );
        }

        this.rows.push(values);

        return this;
    }

    public render(): string[]
    {
        const widths = this.calculateWidths();

        const lines: string[] = [];

        lines.push(this.renderRow(this.columns.map(column => column.name), widths, true));
        lines.push(this.renderSeparator(widths));

        for (const row of this.rows) {
            lines.push(
                this.renderRow(row, widths)
            );
        }

        return lines;
    }

    private calculateWidths(): number[]
    {
        const widths: number[] = [];

        for (let i = 0; i < this.columns.length; i++) {
            if (this.columns[i].width !== undefined) {
                widths.push(this.columns[i].width!);

                continue;
            }

            let width = this.columns[i].name.length;

            for (const row of this.rows) {
                width = Math.max(width, row[i].length);
            }

            widths.push(width);
        }

        return widths;
    }

    private renderRow(values: string[], widths: number[], header: boolean = false): string
    {
        const cells: string[] = [];

        for (let i = 0; i < values.length; i++) {
            const width = widths[i];
            const alignment = (true === header) ? Alignment.Center : this.columns[i].alignment;
            let value = values[i];
            

            switch (alignment) {
                case Alignment.Right:
                    value = value.padStart(width);
                    break;
                case Alignment.Center: {
                    const padding = width - value.length;
                    const left = Math.floor(padding / 2);
                    const right = Math.ceil(padding / 2);

                    value = " ".repeat(left)
                        + value
                        + " ".repeat(right);

                    break;
                }
                case Alignment.Left:
                default:
                    value = value.padEnd(width);
                    break;
            }

            cells.push(value);
        }

        return cells.join("  ");
    }

    private renderSeparator(widths: number[]): string
    {
        return widths
            .map(width => "─".repeat(width))
            .join("──");
    }
}