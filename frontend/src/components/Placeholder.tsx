type PlaceholderProps = {
  title: string
  description: string
}

export default function Placeholder({ title, description }: PlaceholderProps) {
  return (
    <section style={{ maxWidth: 680, margin: '0 auto' }}>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  )
}
