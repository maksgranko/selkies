import logging
import json

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    # Set CORS headers before prepare
    ws.headers['Access-Control-Allow-Origin'] = '*'
    ws.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS, PUT, DELETE'
    ws.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    
    await ws.prepare(request)
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = msg.data
                if data.startswith('HELLO'):
                    # Respond with HELLO to satisfy client handshake
                    await ws.send_str('HELLO')
                elif data.startswith('SESSION'):
                    # Respond with SESSION_OK
                    await ws.send_str('SESSION_OK')
                else:
                    # Echo or handle other messages
                    # For now, just log
                    print(f"Received: {data}")
            elif msg.type == web.WSMsgType.CLOSED:
                break
            elif msg.type == web.WSMsgType.ERROR:
                print('ws connection closed with exception %s', ws.exception())
    except Exception as e:
        print(f"WebSocket error: {e}")
        
    return ws

async def index_handler(request):
    # Handle WebSocket connection at root
    if request.headers.get('Upgrade', '').lower() == 'websocket':
        return await websocket_handler(request)
    
    # Serve index.html if it exists
    index_file = static_path / "index.html"
    if index_file.exists():
        return web.FileResponse(index_file)
    return web.Response(text="Selkies Signalling Server Running")

@web.middleware
async def cors_middleware(request, handler):
    try:
        if request.method == 'OPTIONS':
            response = web.Response()
        else:
            response = await handler(request)
    except web.HTTPException as e:
        response = e
    except Exception as e:
        print(f"Error handling request: {e}")
        import traceback
        traceback.print_exc()
        response = web.Response(status=500, text=str(e))
    
    # Only set headers if response is not prepared (committed)
    if not response.prepared:
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS, PUT, DELETE'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    
    return response

app = web.Application(middlewares=[cors_middleware])
# Add root handler for WebSocket support at /
app.router.add_get("/", index_handler)
app.router.add_get("/ws", websocket_handler)

# Serve static files
current_path = pathlib.Path(__file__).parent
static_path = current_path / "static"
if static_path.exists():
    print(f"Serving static files from: {static_path}")
    app.router.add_static("/", path=static_path, name="static")
else:
    print(f"Warning: Static directory not found at {static_path}")

if __name__ == '__main__':
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description='Run WebSocket server')
    parser.add_argument('--port', type=int, default=8080, 
                        help='Port to run the server on (default: 8080)')
    args = parser.parse_args()
    web.run_app(app, port=args.port)
