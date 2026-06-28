import { Alignment } from "src/debug/cell-alignment";
import { Column } from "src/debug/table-column";

export class Table
{
    private readonly columns: Column[] = [];
    private readonly rows: string[][] = [];

    public column(name: string, width?: number, alignment: Alignment = Alignment.Left): Table 
    {
        if (width !== undefined && width <= 0) {
            throw new Error("Column width must be greater than 0.");
        }

        this.columns.push({name, width, alignment,});

        return this;
    }

    public row(...values: string[]): Table 
    {
        if (values.length !== this.columns.length) {
            throw new Error(`Expected ${this.columns.length} values but got ${values.length}.`);
        }

        this.rows.push(values);

        return this;
    }

    public render(): string[] 
    {
        const widths = this.calculateWidths();

        return [
            this.renderRow(this.columns.map(column => column.name), widths, true),
            this.renderSeparator(widths),
            ...this.rows.map(row => this.renderRow(row, widths)),
        ];
    }

    private calculateWidths(): number[] 
    {
        return this.columns.map((column, index) => {
            if (column.width !== undefined) {
                return column.width;
            }

            let width = column.name.length;

            for (const row of this.rows) {
                width = Math.max(width, row[index].length);
            }

            return width;
        });
    }

    private renderRow(values: string[], widths: number[], isHeader = false): string 
    {
        return values
            .map((value, index) => this.renderCell(
                value,
                widths[index],
                isHeader ? Alignment.Center : this.columns[index].alignment
            ))
            .join("  ");
    }

    private renderCell(value: string, width: number, alignment: Alignment): string 
    {
        const padding = width - value.length;

        if (padding <= 0) {
            return value;
        }

        switch (alignment) {
            case Alignment.Right:
                return value.padStart(width);

            case Alignment.Center: {
                const left = Math.floor(padding / 2);
                const right = Math.ceil(padding / 2);

                return " ".repeat(left) + value + " ".repeat(right);
            }

            case Alignment.Left:
            default:
                return value.padEnd(width);
        }
    }

    private renderSeparator(widths: number[]): string 
    {
        return widths
            .map(width => "─".repeat(width))
            .join("──");
    }
}