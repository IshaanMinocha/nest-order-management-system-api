import { Test, TestingModule } from '@nestjs/testing';
import { OrdersGateway } from './orders.gateway';
import { UserRole } from '@prisma/client';

describe('OrdersGateway', () => {
  let gateway: OrdersGateway;

  const mockSocket = {
    id: 'test-socket-id',
    join: jest.fn().mockReturnValue(Promise.resolve()),
    leave: jest.fn().mockReturnValue(Promise.resolve()),
    user: undefined as any,
  };

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    sockets: {
      adapter: {
        rooms: new Map(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersGateway],
    }).compile();

    gateway = module.get<OrdersGateway>(OrdersGateway);
    gateway.server = mockServer as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should log connection', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');

      gateway.handleConnection(mockSocket as any);

      expect(logSpy).toHaveBeenCalledWith('Client connected: test-socket-id');
    });
  });

  describe('handleDisconnect', () => {
    it('should log disconnection and clean up', () => {
      const logSpy = jest.spyOn(gateway['logger'], 'log');
      mockSocket.user = {
        id: 1,
        email: 'test@example.com',
        role: UserRole.BUYER,
      };

      gateway.handleDisconnect(mockSocket as any);

      expect(logSpy).toHaveBeenCalledWith(
        'Client disconnected: test-socket-id',
      );
      expect(mockSocket.leave).toHaveBeenCalledWith('user-1');
      expect(mockSocket.leave).toHaveBeenCalledWith('role-buyer');
    });
  });

  describe('handleJoinUserRoom', () => {
    it('should join user and role rooms successfully', () => {
      const payload = { userId: 1, userRole: UserRole.BUYER };

      const result = gateway.handleJoinUserRoom(mockSocket as any, payload);

      expect(result).toMatchObject({
        status: 'success',
        message: 'Joined rooms: user-1, role-buyer',
        rooms: ['user-1', 'role-buyer'],
      });
      expect(mockSocket.join).toHaveBeenCalledWith('user-1');
      expect(mockSocket.join).toHaveBeenCalledWith('role-buyer');
      expect(mockSocket.user).toEqual({
        id: 1,
        email: '',
        role: UserRole.BUYER,
      });
    });

    it('should handle different user roles', () => {
      const adminPayload = { userId: 2, userRole: UserRole.ADMIN };

      const result = gateway.handleJoinUserRoom(
        mockSocket as any,
        adminPayload,
      );

      expect(result.rooms).toEqual(['user-2', 'role-admin']);
      expect(mockSocket.join).toHaveBeenCalledWith('user-2');
      expect(mockSocket.join).toHaveBeenCalledWith('role-admin');
    });
  });

  describe('handleJoinOrderRoom', () => {
    it('should join order room successfully', () => {
      const payload = { orderId: 123 };

      const result = gateway.handleJoinOrderRoom(mockSocket as any, payload);

      expect(result).toMatchObject({
        status: 'success',
        message: 'Joined order room: order-123',
        room: 'order-123',
      });
      expect(mockSocket.join).toHaveBeenCalledWith('order-123');
    });
  });

  describe('handleLeaveOrderRoom', () => {
    it('should leave order room successfully', () => {
      const payload = { orderId: 123 };

      const result = gateway.handleLeaveOrderRoom(mockSocket as any, payload);

      expect(result).toMatchObject({
        status: 'success',
        message: 'Left order room: order-123',
        room: 'order-123',
      });
      expect(mockSocket.leave).toHaveBeenCalledWith('order-123');
    });
  });

  describe('broadcastOrderStatusUpdate', () => {
    it('should broadcast order status update to relevant users', () => {
      const orderData = {
        orderId: 1,
        buyerId: 2,
        supplierIds: [3, 4],
        orderNumber: 'ORD-2024-001',
        oldStatus: 'PENDING',
        newStatus: 'APPROVED',
        updatedBy: {
          id: 1,
          email: 'admin@oms.com',
          role: UserRole.ADMIN,
        },
        updatedAt: '2024-01-15T10:30:00.000Z',
        reason: 'Stock verified',
      };

      gateway.broadcastOrderStatusUpdate(orderData);

      const expectedPayload = {
        type: 'order-status-updated',
        data: orderData,
        timestamp: expect.any(String),
      };

      // Should emit to order room
      expect(mockServer.to).toHaveBeenCalledWith('order-1');
      // Should emit to buyer
      expect(mockServer.to).toHaveBeenCalledWith('user-2');
      // Should emit to suppliers
      expect(mockServer.to).toHaveBeenCalledWith('user-3');
      expect(mockServer.to).toHaveBeenCalledWith('user-4');
      // Should emit to all admins
      expect(mockServer.to).toHaveBeenCalledWith('role-admin');

      expect(mockServer.emit).toHaveBeenCalledWith(
        'order-update',
        expectedPayload,
      );
    });
  });

  describe('broadcastNewOrder', () => {
    it('should broadcast new order to suppliers and admins', () => {
      const orderData = {
        orderId: 1,
        buyerId: 2,
        supplierIds: [3],
        orderNumber: 'ORD-2024-001',
        totalAmount: 150.75,
        itemCount: 2,
        createdAt: '2024-01-15T09:00:00.000Z',
      };

      gateway.broadcastNewOrder(orderData);

      const expectedPayload = {
        type: 'new-order-created',
        data: orderData,
        timestamp: expect.any(String),
      };

      // Should emit to suppliers
      expect(mockServer.to).toHaveBeenCalledWith('user-3');
      // Should emit to admins
      expect(mockServer.to).toHaveBeenCalledWith('role-admin');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'order-update',
        expectedPayload,
      );
    });
  });

  describe('broadcastStockUpdate', () => {
    it('should broadcast stock update to supplier and admins', () => {
      const stockData = {
        productId: 1,
        productName: 'Test Product',
        supplierId: 3,
        oldStock: 5000,
        newStock: 7000,
        operation: 'increment' as const,
        reason: 'Stock replenishment',
      };

      gateway.broadcastStockUpdate(stockData);

      const expectedPayload = {
        type: 'stock-updated',
        data: stockData,
        timestamp: expect.any(String),
      };

      // Should emit to supplier
      expect(mockServer.to).toHaveBeenCalledWith('user-3');
      // Should emit to admins
      expect(mockServer.to).toHaveBeenCalledWith('role-admin');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'stock-update',
        expectedPayload,
      );
    });
  });

  describe('getConnectedClientsCount', () => {
    it('should return number of connected clients', () => {
      // Add some mock clients
      gateway['connectedClients'].set('client1', mockSocket as any);
      gateway['connectedClients'].set('client2', mockSocket as any);

      const count = gateway.getConnectedClientsCount();

      expect(count).toBe(2);
    });
  });

  describe('getRoomsInfo', () => {
    it('should return rooms information', () => {
      // Mock some room data
      const mockRooms = new Map();
      mockRooms.set('user-1', new Set(['socket1', 'socket2']));
      mockRooms.set('role-admin', new Set(['socket3']));

      gateway.server.sockets.adapter.rooms = mockRooms;

      const roomsInfo = gateway.getRoomsInfo();

      expect(roomsInfo).toEqual({
        'user-1': {
          clientCount: 2,
          clients: ['socket1', 'socket2'],
        },
        'role-admin': {
          clientCount: 1,
          clients: ['socket3'],
        },
      });
    });
  });
});
