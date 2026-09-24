import Providers from './Providers';
import Console from './Console';

export const metadata = { title: 'Readback · dApp' };

export default function App() {
  return (
    <Providers>
      <Console />
    </Providers>
  );
}
