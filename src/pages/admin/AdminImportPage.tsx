import EquipamentosPanel from '../../components/EquipamentosPanel';
import { useData } from '../../context/DataContext';

export default function AdminImportPage() {
  const { payload, reload, setPayload } = useData();

  return (
    <EquipamentosPanel
      section="import"
      data={payload}
      onDataChange={(d) => {
        setPayload(d);
        if (d) void reload();
      }}
      onReload={() => void reload()}
    />
  );
}
