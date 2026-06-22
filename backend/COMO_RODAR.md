# Como rodar o back-end do e-JINIFF

## 1. Instale o Node.js

Baixe e instale pelo site oficial:
👉 https://nodejs.org/  (versão LTS recomendada)

---

## 2. Instale as dependências

Abra o terminal (CMD ou PowerShell), entre na pasta `backend` e rode:

```
npm install
```

---

## 3. Inicie o servidor

```
npm start
```

Você verá no terminal:
```
✅ Servidor rodando em http://localhost:3000
📋 Admin: http://localhost:3000/admin
🎮 Site:  http://localhost:3000/Index.html
```

---

## 4. Acesse no navegador

| O quê | Endereço |
|---|---|
| Site principal | http://localhost:3000/Index.html |
| Painel admin | http://localhost:3000/admin |
| API inscrições | http://localhost:3000/api/inscricoes |
| Estatísticas | http://localhost:3000/api/estatisticas |

---

## Endpoints da API

| Método | Rota | Descrição |
|---|---|---|
| POST | /api/inscricoes | Cadastrar inscrição |
| GET | /api/inscricoes | Listar todas as inscrições |
| GET | /api/inscricoes?modalidade=lol | Filtrar por modalidade |
| GET | /api/inscricoes/:id | Buscar inscrição por ID |
| DELETE | /api/inscricoes/:id | Remover inscrição |
| GET | /api/estatisticas | Contagem por modalidade |

---

## Onde ficam os dados?

As inscrições ficam salvas no arquivo `backend/inscricoes.db` (banco SQLite).
Não é necessário instalar nenhum banco de dados separado.
