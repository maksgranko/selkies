from aiohttp import web
import pathlib
import argparse

async def websocket_handler(request):
    ws = web.WebSocketResponse()
    # Set CORS headers before prepare, as middleware runs too late for the handshake
    ws.headers['Access-Control-Allow-Origin'] = '*'
    ws.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS, PUT, DELETE'
    ws.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    
    await ws.prepare(request)
    async for msg in ws:
        if msg.type == web.WSMsgType.TEXT:
            await ws.send_str("Echo: " + msg.data)
        elif msg.type == web.WSMsgType.CLOSED:
            break
    return ws

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
