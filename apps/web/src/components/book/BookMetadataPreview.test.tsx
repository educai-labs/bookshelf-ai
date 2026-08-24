import { render, screen, fireEvent } from "@testing-library/react";
import { BookMetadataPreview } from "./BookMetadataPreview";

const mockData = {
  cover_url: "https://example.com/cover.jpg",
  title: "Test Book Title",
  authors: ["Author One", "Author Two"],
  page_count: 300,
  publisher: "Test Publisher",
  published_date: "2024-01-15",
  description:
    "This is a test description that is long enough to be truncated when displayed in the preview component. It should show the 'Ver más' button when not expanded and allow the user to expand it to see the full description.",
};

describe("BookMetadataPreview", () => {
  it("renderiza skeleton cuando isLoading=true", () => {
    render(<BookMetadataPreview data={null} isLoading={true} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Cargando vista previa del libro"),
    ).toBeInTheDocument();
  });

  it("renderiza skeleton cuando data es null", () => {
    render(<BookMetadataPreview data={null} isLoading={false} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renderiza todos los campos cuando data está presente", () => {
    render(<BookMetadataPreview data={mockData} />);

    // Portada
    expect(
      screen.getByAltText("Portada de Test Book Title"),
    ).toBeInTheDocument();

    // Título
    expect(screen.getByText("Test Book Title")).toBeInTheDocument();

    // Autores
    expect(screen.getByText("Author One, Author Two")).toBeInTheDocument();

    // Páginas
    expect(screen.getByText("300 págs.")).toBeInTheDocument();

    // Editorial
    expect(screen.getByText("Editorial: Test Publisher")).toBeInTheDocument();

    // Fecha
    expect(screen.getByText("Publicado: 2024-01-15")).toBeInTheDocument();
  });

  it("muestra placeholder cuando no hay cover_url", () => {
    const dataNoCover = { ...mockData, cover_url: null };
    render(<BookMetadataPreview data={dataNoCover} />);

    expect(screen.getByLabelText("Sin portada disponible")).toBeInTheDocument();
    expect(screen.getByLabelText("Sin portada disponible")).toContainHTML(
      "svg",
    );
  });

  it("trunca la descripción larga y muestra botón 'Ver más'", () => {
    render(<BookMetadataPreview data={mockData} />);

    const descriptionText = screen.getByText(/This is a test description/);
    expect(descriptionText).toHaveTextContent("...");

    expect(
      screen.getByRole("button", { name: /ver más/i }),
    ).toBeInTheDocument();
  });

  it("expande la descripción al click en 'Ver más'", () => {
    render(<BookMetadataPreview data={mockData} />);

    const expandButton = screen.getByRole("button", { name: /ver más/i });
    fireEvent.click(expandButton);

    expect(
      screen.getByRole("button", { name: /ver menos/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(mockData.description)).toBeInTheDocument();
  });

  it("colapsa la descripción al click en 'Ver menos'", () => {
    render(<BookMetadataPreview data={mockData} />);

    const expandButton = screen.getByRole("button", { name: /ver más/i });
    fireEvent.click(expandButton);

    const collapseButton = screen.getByRole("button", { name: /ver menos/i });
    fireEvent.click(collapseButton);

    expect(
      screen.getByRole("button", { name: /ver más/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/This is a test description/)).toHaveTextContent(
      "...",
    );
  });

  it("no muestra botón 'Ver más' si descripción es corta", () => {
    const shortDescription = { ...mockData, description: "Short description." };
    render(<BookMetadataPreview data={shortDescription} />);

    expect(
      screen.queryByRole("button", { name: /ver más/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Short description.")).toBeInTheDocument();
  });

  it("maneja arrays de autores vacíos", () => {
    const noAuthors = { ...mockData, authors: [] };
    render(<BookMetadataPreview data={noAuthors} />);

    expect(screen.getByText("Autor desconocido")).toBeInTheDocument();
  });

  it("maneja valores null en campos opcionales", () => {
    const sparseData = {
      cover_url: null,
      title: "Sparse Book",
      authors: [],
      page_count: null,
      publisher: null,
      published_date: null,
      description: null,
    };
    render(<BookMetadataPreview data={sparseData} />);

    expect(screen.getByLabelText("Sin portada disponible")).toBeInTheDocument();
    expect(screen.getByText("Sparse Book")).toBeInTheDocument();
    expect(screen.getByText("Autor desconocido")).toBeInTheDocument();
    expect(screen.queryByText(/págs\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Editorial:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Publicado:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ver más/i)).not.toBeInTheDocument();
  });
});
