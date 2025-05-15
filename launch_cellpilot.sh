uvicorn --app-dir backend app.main:app \
        --host 127.0.0.1 --port 8000 --reload \
        > backend.log 2>&1 &
BACKEND_PID=$!
npm start --prefix ./my-app 
kill $BACKEND_PID