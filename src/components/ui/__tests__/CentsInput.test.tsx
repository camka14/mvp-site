import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CentsInput from "../CentsInput";
import { renderWithMantine } from "../../../../test/utils/renderWithMantine";
import {
  formatPriceInputValue,
  parsePriceInputToCents,
} from "@/lib/priceUtils";

describe("priceUtils", () => {
  it("formats cents for display and keeps zero blank by default", () => {
    expect(formatPriceInputValue(0)).toBe("");
    expect(formatPriceInputValue(123456)).toBe("1,234.56");
  });

  it("parses digits into cents and ignores punctuation", () => {
    expect(parsePriceInputToCents("$1,234.56")).toBe(123456);
    expect(parsePriceInputToCents("abc")).toBe(0);
  });
});

describe("CentsInput", () => {
  it("starts blank for zero and shifts typed digits into cents", async () => {
    const user = userEvent.setup();

    function Wrapper() {
      const [value, setValue] = React.useState(0);
      return <CentsInput label="Price" value={value} onChange={setValue} />;
    }

    renderWithMantine(<Wrapper />);

    const input = screen.getByLabelText(/Price/i);
    expect(input).toHaveValue("");

    await user.type(input, "1234");

    expect(input).toHaveValue("12.34");
  });

  it("ignores punctuation and clears back to blank zero", () => {
    function Wrapper() {
      const [value, setValue] = React.useState(0);
      return (
        <CentsInput label="Rental price" value={value} onChange={setValue} />
      );
    }

    renderWithMantine(<Wrapper />);

    const input = screen.getByLabelText(/Rental price/i);

    fireEvent.change(input, { target: { value: "$1,234.56" } });
    expect(input).toHaveValue("1,234.56");

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
  });
});
