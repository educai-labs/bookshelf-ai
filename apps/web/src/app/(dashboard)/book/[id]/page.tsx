/**
 * Placeholder del detalle de libro — la UI real (reading sheet) se implementa
 * en la feature 015.
 */
export default function BookDetailPage({ params }: { params: { id: string } }) {
  return (
    <h1 className="text-2xl font-semibold">
      Book Detail - Feature 015{" "}
      <span className="text-muted-foreground">({params.id})</span>
    </h1>
  );
}
