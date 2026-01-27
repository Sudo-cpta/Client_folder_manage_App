import { useState } from 'react';
import type { FolderTemplate } from '../types';

interface FolderTreeProps {
  folders: FolderTemplate[];
  selectedId?: string;
  onSelect?: (folder: FolderTemplate) => void;
}

export function FolderTree({ folders, selectedId, onSelect }: FolderTreeProps) {
  return (
    <ul className="folder-tree">
      {folders.map(folder => (
        <FolderItem
          key={folder.id}
          folder={folder}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

interface FolderItemProps {
  folder: FolderTemplate;
  selectedId?: string;
  onSelect?: (folder: FolderTemplate) => void;
  level?: number;
}

function FolderItem({ folder, selectedId, onSelect, level = 0 }: FolderItemProps) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = folder.children.length > 0;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded(!expanded);
    }
    onSelect?.(folder);
  };

  return (
    <li className="folder-item">
      <div
        className={`folder-name ${selectedId === folder.id ? 'selected' : ''}`}
        onClick={handleClick}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <span className="folder-icon">
          {hasChildren ? (expanded ? '📂' : '📁') : '📄'}
        </span>
        {folder.name}
      </div>
      {hasChildren && expanded && (
        <ul className="folder-children">
          {folder.children.map(child => (
            <FolderItem
              key={child.id}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
