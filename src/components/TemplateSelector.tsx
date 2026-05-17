import { templates, CATEGORY_LABELS } from "../templates/scenarios";
import "./TemplateSelector.css";

interface Props {
  onSelect: (index: number) => void;
}

export function TemplateSelector({ onSelect }: Props) {
  const categories = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

  return (
    <div className="template-selector">
      {categories.map((cat) => {
        const catTemplates = templates
          .map((t, i) => ({ ...t, index: i }))
          .filter((t) => t.category === cat);

        if (catTemplates.length === 0) return null;

        const { label, icon } = CATEGORY_LABELS[cat];

        return (
          <div key={cat} className="template-category">
            <div className="category-header">
              <span>{icon} {label}</span>
            </div>
            {catTemplates.map((t) => (
              <button
                key={t.index}
                className="template-item"
                onClick={() => onSelect(t.index)}
                title={t.description}
              >
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.description}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
